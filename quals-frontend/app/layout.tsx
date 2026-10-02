import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Quals',
  description: 'Open a document that someone has shared with you.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The brand is the dark set: the app opens on black with gold and white, so the site does too.
    <html lang="en" data-theme="dark">
      <body>
        <main className="container-narrow">{children}</main>
      </body>
    </html>
  );
}
