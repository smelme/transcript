import type { Metadata } from 'next';
import './globals.css';
import Shell from './shell';

export const metadata: Metadata = {
  title: 'Quals: credential management',
  description: 'Centralised management of issued credentials, sharing and wallet accounts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
