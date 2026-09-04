import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart College — Credential Issuer',
  description: 'Issue ISO 23220 Photo ID mDOC credentials',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <Link href="/" className="brand">
            Credential Issuer
          </Link>
          <nav className="nav-links">
            <Link href="/invite">Invite &amp; Issue</Link>
            <Link href="/issue">Issue Credential</Link>
            <Link href="/credentials">Credentials</Link>
            <Link href="/history">Audit History</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
