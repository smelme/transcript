import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Quals',
  description: 'Open a document that someone has shared with you.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="container-narrow">{children}</main>
      </body>
    </html>
  );
}
