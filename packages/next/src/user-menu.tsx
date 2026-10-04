'use client';

import { LuLogOut as LogOut } from 'react-icons/lu';
import { useEffect, useState } from 'react';

/** Signed-in reader + sign out (private docs). Renders nothing for anonymous readers or static hosts. */
export function UserMenu({ base }: { base: string }) {
  const [email, setEmail] = useState<string>();
  useEffect(() => {
    fetch(`${base}/_auth/me`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { email: string } } | null) => setEmail(d?.user?.email))
      .catch(() => undefined);
  }, [base]);
  if (!email) return null;
  const initials = email.split('@')[0]!.split(/[._-]/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <span className="od-user-menu" title={email}>
      <span className="od-user-avatar" aria-label={`Signed in as ${email}`}>
        {initials || email[0]!.toUpperCase()}
      </span>
      <a href={`${base}/_auth/logout`} className="od-user-logout" aria-label="Sign out" title="Sign out">
        <LogOut size={14} />
      </a>
    </span>
  );
}
