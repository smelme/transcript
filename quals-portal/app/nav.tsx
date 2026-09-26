'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isPlatformAdmin, useAdmin } from './components/session';

const OVERVIEW = { href: '/', label: 'Overview' };
const CREDENTIALS = { href: '/credentials', label: 'Credentials' };
// The queue for people the institution could not identify from an address alone. An organisation's
// own administrator works it; a platform administrator sees every institution's.
const REQUESTS = { href: '/requests', label: 'Manual requests' };
const SHARING = { href: '/shares', label: 'Sharing' };
const WALLET_ACCOUNTS = { href: '/accounts', label: 'Wallet accounts' };
const API_KEYS = { href: '/api-keys', label: 'API keys' };
const AUDIT = { href: '/audit', label: 'Audit log' };

/**
 * The platform operator administers the network; a client organisation administers
 * its own credentials, keys and audit trail and nothing else.
 */
const PLATFORM_ITEMS = [OVERVIEW, CREDENTIALS, REQUESTS, SHARING, WALLET_ACCOUNTS, AUDIT];
const ORGANISATION_ITEMS = [OVERVIEW, CREDENTIALS, REQUESTS, API_KEYS, AUDIT];

export default function Nav() {
  const pathname = usePathname();
  const admin = useAdmin();

  // Nothing until the session says which scope this administrator has, so the menu
  // never offers an area that will be refused.
  if (!admin) return null;

  const items = isPlatformAdmin(admin) ? PLATFORM_ITEMS : ORGANISATION_ITEMS;
  return (
    <nav className="nav-group">
      <span className="nav-label">Manage</span>
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
