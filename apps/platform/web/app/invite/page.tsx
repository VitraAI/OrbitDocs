'use client';

import { Alert, Button, Card, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Wordmark } from '@/components/shell';
import { api, useApi } from '@/lib/api';

function Invite() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { data, error } = useApi<{ email: string; role: string; project: string | null }>(token ? `/api/invitations/${token}` : null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/api/invitations/${token}/accept`, { method: 'POST', json: { name: form.get('name'), password: form.get('password') } });
      router.replace('/');
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--surface-secondary)] px-4">
      <Card className="w-full max-w-sm">
        <Card.Header className="items-center text-center">
          <span className="mb-3 flex justify-center">
            <Wordmark />
          </span>
          <Card.Title>Join OrbitDocs</Card.Title>
          <Card.Description>
            {data ? <>{data.email} is invited{data.project ? ` to ${data.project} as ${data.role}` : ''}.</> : 'Checking your invitation…'}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {error || !token ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error?.message ?? 'This link has no invitation token.'}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : !data ? (
            <Spinner />
          ) : (
            <Form onSubmit={submit} className="flex flex-col gap-3">
              {problem ? <p className="text-sm text-[var(--danger)]">{problem}</p> : null}
              <TextField name="name" isRequired>
                <Label>Your name</Label>
                <Input variant="secondary" />
              </TextField>
              <TextField name="password" type="password" isRequired minLength={10}>
                <Label>Choose a password</Label>
                <Input variant="secondary" placeholder="At least 10 characters" />
              </TextField>
              <Button type="submit" className="mt-1 w-full" isPending={busy}>
                Accept and sign in
              </Button>
            </Form>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <Invite />
    </Suspense>
  );
}
