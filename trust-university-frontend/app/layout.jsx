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
              Trust University checks credentials. We do not contact your institution, and we do not
              keep your credential. Everything shown here comes from the credential itself, at the
              moment you shared it.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
