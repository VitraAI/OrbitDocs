'use client';

import { Alert, Button, Label, TextArea } from '@heroui/react';
import { useState } from 'react';

import { parseCurl } from '../curl';
import type { RequestDraft } from '../types';

export function ImportView({ collectionId, collectionName, onImport }: { collectionId: string; collectionName: string; onImport: (r: RequestDraft) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  return (
    <div className="oc-import">
      <h3 className="oc-h3">Import a cURL command</h3>
      <p className="oc-hint">It becomes a new request in {collectionName}. Headers, body, query and basic auth are kept.</p>
      <div className="oc-field">
        <Label>cURL</Label>
        <TextArea
          aria-label="cURL command"
          className="oc-code-input"
          rows={8}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"curl https://api.example.com/v1/things \\\n  -H 'Authorization: Bearer …'"}
        />
      </div>
      {error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not import</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <Button
        size="sm"
        className="oc-self-start"
        isDisabled={!text.trim()}
        onPress={() => {
          try {
            onImport(parseCurl(text, collectionId));
            setText('');
            setError(undefined);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Import
      </Button>
    </div>
  );
}
