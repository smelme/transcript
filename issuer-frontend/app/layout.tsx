import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import ThemeToggle from './theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Academy — Digital qualifications and transcripts',
  description:
    'Access your academic qualifications and transcripts as verifiable digital credentials you can save, share and prove anywhere.',
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
              <img src="/logo.svg" alt="" width={30} height={30} />
            </span>
            <span>
              Smart Academy
              <span className="brand-sub">Registry</span>
            </span>
          </Link>
          <nav className="nav-links">
            <Link href="/credentials">Digital credentials</Link>
            <Link href="/get-credentials" className="nav-cta">
              Get your credentials
            </Link>
          </nav>
          <ThemeToggle />
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>Smart Academy — example issuing authority for the Quals network.</span>
            <span>
              Powered by <strong style={{ color: '#fff' }}>Quals</strong> verifiable credentials
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
