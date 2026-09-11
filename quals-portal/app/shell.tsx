'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Nav from './nav';

type Admin = { email: string; role: string; institution?: string | null };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const isLogin = pathname === '/login';

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success) setAdmin(data.admin);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLogin, pathname]);

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  if (isLogin) return <>{children}</>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark" aria-hidden="true">
            Q
          </span>
          <span>
            Quals
            <small>Management portal</small>
          </span>
        </div>

        <Nav />

        <div className="sidebar-footer">
          {admin && (
            <div className="session-box">
              <div className="session-email" title={admin.email}>
                {admin.email}
              </div>
              <div className="session-role">{admin.role}</div>
              <div className="session-role">
                {admin.institution ? admin.institution : 'All organisations'}
              </div>
            </div>
          )}
          <button type="button" className="signout" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <p className="sidebar-note">
            Credential metadata only — no credential contents are stored.
          </p>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
