'use client';

import { Button, Checkbox, Chip, Label, ListBox, NumberField, ProgressBar, Select, Switch, Table } from '@heroui/react';
import { LuPlay as Play, LuSquare as Square } from 'react-icons/lu';
import { useRef, useState } from 'react';

import { sendRequest } from '../send';
import type { Collection, Environment, RequestDraft, RunResult, Variable } from '../types';
import { MethodTag } from './rail';

interface Row {
  key: string;
  request: RequestDraft;
  iteration: number;
  result?: RunResult;
  state: 'queued' | 'running' | 'done';
}

const patchVars = (vars: Variable[], writes: Record<string, string | null>) => {
  let out = [...vars];
  for (const [key, value] of Object.entries(writes)) {
    if (value === null) out = out.filter((v) => v.key !== key);
    else if (out.some((v) => v.key === key)) out = out.map((v) => (v.key === key ? { ...v, value } : v));
    else out.push({ key, value, enabled: true });
  }
  return out;
};

/** Runs a collection or folder top to bottom; script variables flow to the next request. */
export function RunnerView({
  collection,
  requests,
  environment,
  globals,
  onWrites,
}: {
  collection: Collection;
  requests: RequestDraft[];
  environment?: Environment;
  globals: Variable[];
  onWrites: (env: Record<string, string | null>, globals: Record<string, string | null>) => void;
}) {
  const [folder, setFolder] = useState('all');
  const [iterations, setIterations] = useState(1);
  const [delay, setDelay] = useState(0);
  const [stopOnFail, setStopOnFail] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const inFolder = requests.filter((r) => folder === 'all' || r.folder === folder);
  const queue = inFolder.filter((r) => !excluded.has(r.id));

  async function run() {
    stop.current = false;
    const plan: Row[] = [];
    for (let it = 1; it <= iterations; it++) for (const r of queue) plan.push({ key: `${it}:${r.id}`, request: r, iteration: it, state: 'queued' });
    setRows(plan);
    setRunning(true);
    let env = environment;
    let glob = globals;
    let runVariables: Record<string, string> = {};
    for (let i = 0; i < plan.length && !stop.current; i++) {
      setRows((rs) => rs.map((r, j) => (j === i ? { ...r, state: 'running' } : r)));
      const outcome = await sendRequest(plan[i]!.request, { collection, environment: env, globals: glob, runVariables });
      runVariables = outcome.runVariables;
      if (env) env = { ...env, variables: patchVars(env.variables, outcome.environment) };
      glob = patchVars(glob, outcome.globals);
      onWrites(outcome.environment, outcome.globals);
      setRows((rs) => rs.map((r, j) => (j === i ? { ...r, state: 'done', result: outcome } : r)));
      const failed = Boolean(outcome.error) || outcome.tests.some((t) => !t.passed) || !outcome.response?.status || outcome.response.status >= 400;
      if (stopOnFail && failed) break;
      if (delay) await new Promise((res) => setTimeout(res, delay));
    }
    setRunning(false);
  }

  const done = rows.filter((r) => r.result);
  const tests = done.flatMap((r) => r.result!.tests);
  const okRequests = done.filter((r) => (r.result?.response?.status ?? 0) > 0 && r.result!.response!.status < 400).length;
  return (
    <div className="oc-runner">
      <div className="oc-runner-controls">
        <div className="oc-field">
          <Label>Run</Label>
          <Select aria-label="Folder" value={folder} onChange={(v) => v && setFolder(String(v))} className="oc-w-56">
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[['all', `All of ${collection.name}`], ...collection.folders.map((f) => [f, f])].map(([id, label]) => (
                  <ListBox.Item key={id} id={id} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <NumberField value={iterations} onChange={(v) => setIterations(Math.max(1, v || 1))} minValue={1} maxValue={100} className="oc-w-36">
          <Label>Iterations</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <NumberField value={delay} onChange={(v) => setDelay(Math.max(0, v || 0))} minValue={0} step={100} className="oc-w-36">
          <Label>Delay (ms)</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <Switch isSelected={stopOnFail} onChange={setStopOnFail}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Stop on first failure
          </Switch.Content>
        </Switch>
        <div className="oc-grow" />
        {running ? (
          <Button size="sm" variant="danger" onPress={() => (stop.current = true)}>
            <Square size={14} /> Stop
          </Button>
        ) : (
          <Button size="sm" isDisabled={!queue.length} onPress={() => void run()}>
            <Play size={14} /> Run {queue.length * iterations} requests
          </Button>
        )}
      </div>

      {rows.length ? (
        <>
          <ProgressBar aria-label="Run progress" value={(done.length / rows.length) * 100} className="oc-runner-progress">
            <Label>
              {done.length}/{rows.length} requests · {okRequests} succeeded · tests {tests.filter((t) => t.passed).length}/{tests.length}
            </Label>
            <ProgressBar.Output />
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Run results">
                <Table.Header>
                  <Table.Column isRowHeader>Request</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Time</Table.Column>
                  <Table.Column>Tests</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((r) => (
                    <Table.Row key={r.key} id={r.key}>
                      <Table.Cell>
                        <span className="oc-row">
                          <MethodTag method={r.request.method} /> {r.request.name}
                          {iterations > 1 ? <span className="oc-hint">#{r.iteration}</span> : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        {r.state === 'done' ? (
                          <Chip size="sm" variant="soft" color={(r.result?.response?.status ?? 0) >= 200 && (r.result?.response?.status ?? 0) < 400 ? 'success' : 'danger'}>
                            <Chip.Label>{r.result?.response?.status || 'ERR'}</Chip.Label>
                          </Chip>
                        ) : (
                          <span className="oc-hint">{r.state}</span>
                        )}
                      </Table.Cell>
                      <Table.Cell className="oc-hint">{r.result?.response ? `${r.result.response.time} ms` : ''}</Table.Cell>
                      <Table.Cell>
                        <div className="oc-runner-tests">
                          {r.result?.tests.map((t, j) => (
                            <span key={j} className="oc-runner-test" data-passed={t.passed} title={t.error}>
                              {t.passed ? '✓' : '✗'} {t.name}
                            </span>
                          ))}
                          {r.result?.error ? <span className="oc-danger-text">{r.result.error}</span> : null}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
          {!running ? (
            <Button variant="ghost" size="sm" onPress={() => setRows([])}>
              Edit selection
            </Button>
          ) : null}
        </>
      ) : (
        <div className="oc-runner-pick">
          {inFolder.map((r) => (
            <Checkbox key={r.id} isSelected={!excluded.has(r.id)} onChange={(on) => setExcluded((s) => { const n = new Set(s); if (on) n.delete(r.id); else n.add(r.id); return n; })}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <MethodTag method={r.method} /> {r.name}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      )}
    </div>
  );
}
