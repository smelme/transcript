import type { Metadata } from 'next';
import './globals.css';
import Nav from './nav';

export const metadata: Metadata = {
  title: 'Quals — Credential management',
  description: 'Centralised management of issued credentials, sharing and wallet accounts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
              Connected to the issuer service. Credential metadata only — no credential contents are
              stored.
            </div>
          </aside>
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
