import Link from 'next/link';
import Script from 'next/script';
import Navigation from './components/Navigation';
import ThemeToggle from './theme-toggle';
import './globals.css';

export const metadata = {
  title: 'My Jobs — Credential Verification',
  description: 'Verify ISO 18013-5 mDOC academic credentials',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`}
        </Script>
        <div className="shell">
          <header className="navbar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="" width={30} height={30} />
              </span>
              <span className="brand-name">My Jobs</span>
              <span className="brand-tag">Verification</span>
            </Link>
            <Navigation />
            <ThemeToggle />
          </header>
          <main className="container">{children}</main>
          <footer className="footer">
            My Jobs credential verification &middot; powered by ISO 18013-5 mDOC
          </footer>
        </div>
      </body>
    </html>
  );
}
