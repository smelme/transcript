'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/verify-academic', label: 'Verify for My Jobs' },
  { href: '/issuers', label: 'Trusted Issuers' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Primary">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? 'active' : ''}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
