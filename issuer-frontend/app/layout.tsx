import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import ThemeToggle from './theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Academy — Credential Issuer',
  description: 'Issue ISO 18013-5 mDOC academic credentials',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`}
        </Script>
        <header className="navbar">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" width={28} height={28} />
            </span>
            Smart Academy
          </Link>
          <nav className="nav-links">
            <Link href="/invite">Invite &amp; Issue</Link>
            <Link href="/issue">Issue Credential</Link>
            <Link href="/credentials">Credentials</Link>
            <Link href="/history">Audit History</Link>
          </nav>
          <ThemeToggle />
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
