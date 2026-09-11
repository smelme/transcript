'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Nav from './nav';
import { PageHeader } from './components/ui';
import {
  SessionContext,
  canOpen,
  isPlatformAdmin,
  restrictedTo,
  type Admin,
} from './components/session';

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

  const platform = isPlatformAdmin(admin);
  const allowed = canOpen(pathname, admin);

  return (
    <SessionContext.Provider value={admin}>
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
        <div className="main">
          {allowed ? (
            children
          ) : (
            <main>
              <PageHeader
                title="Not available"
                subtitle={`This area is limited to ${restrictedTo(pathname)}.`}
              />
              <div className="content">
                <div className="notice err">
                  {platform
                    ? 'You are signed in as the platform operator. API keys belong to the client organisation that issues with them, so they are managed there.'
                    : `${admin?.institution ?? 'Your organisation'} cannot open this area; it belongs to the platform operator.`}
                </div>
              </div>
            </main>
          )}
        </div>
      </div>
    </SessionContext.Provider>
  );
}
