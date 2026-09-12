import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Trust University · Postgraduate admissions',
  description:
    'Apply for postgraduate study by presenting your academic transcript from your own wallet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              Trust University
              <span className="brand-sub">Postgraduate admissions</span>
            </Link>
            <nav className="nav" aria-label="Primary">
              <Link href="/">Apply</Link>
              <Link href="/#how">How it works</Link>
            </nav>
          </div>
        </header>

        <main className="container" id="main">{children}</main>

        <footer className="site-footer">
          <div className="container">
            <p>
              Trust University verifies credentials; it does not contact your institution, and it
              does not store your credential. Every value shown to us is read from the signature
              and the revocation status at the moment you share it.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
