'use client';

import { Alert, Button, Card, Form, Input, Label, Separator, TextField } from '@heroui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { BsMicrosoft } from 'react-icons/bs';
import { SiAuth0, SiClerk, SiGoogle, SiKeycloak, SiOkta } from 'react-icons/si';

import { BuiltByVitra, Wordmark } from '@/components/shell';
import { api, type Me, useApi } from '@/lib/api';

const BRAND: Record<string, IconType> = { google: SiGoogle, microsoft: BsMicrosoft, okta: SiOkta, auth0: SiAuth0, clerk: SiClerk, keycloak: SiKeycloak };

function Login() {
  const { data } = useApi<Me>('/api/auth/me');
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState(params.get('error') === 'sso' ? 'Single sign-on failed. Try again.' : params.get('error'));
  const [busy, setBusy] = useState(false);
  const next = params.get('next') ?? '/';

  useEffect(() => {
    if (data?.user) router.replace(next);
  }, [data, next, router]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', json: { email: form.get('email'), password: form.get('password') } });
      router.replace(next.startsWith('/') ? next : '/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--surface-secondary)] px-4 py-10">
      <Card className="w-full max-w-sm">
        <Card.Header className="items-center text-center">
          <span className="mb-3 flex justify-center">
            <Wordmark />
          </span>
          <Card.Title>Sign in to OrbitDocs</Card.Title>
          <Card.Description>Manage your docs sites, specs and team.</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {data?.sso.length ? (
            <>
              <div className="flex flex-col gap-2">
                {data.sso.map((p) => {
                  const Icon = BRAND[p.brand];
                  return (
                    <Button key={p.id} variant="secondary" className="w-full" onPress={() => location.assign(`/api/sso/_auth/start/${p.id}?next=${encodeURIComponent('/api/sso/finish')}`)}>
                      {Icon ? <Icon size={16} /> : null}
                      Continue with {p.name}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                <Separator className="flex-1" /> or <Separator className="flex-1" />
              </div>
            </>
          ) : null}
          <Form onSubmit={submit} className="flex flex-col gap-3">
            <TextField name="email" type="email" isRequired autoComplete="username">
              <Label>Email</Label>
              <Input placeholder="you@company.com" variant="secondary" />
            </TextField>
            <TextField name="password" type="password" isRequired autoComplete="current-password">
              <Label>Password</Label>
              <Input placeholder="••••••••" variant="secondary" />
            </TextField>
            <Button type="submit" className="mt-1 w-full" isPending={busy}>
              Sign in
            </Button>
          </Form>
        </Card.Content>
      </Card>
      <BuiltByVitra />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
