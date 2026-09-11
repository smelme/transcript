'use client';

import { createContext, useContext } from 'react';

/** The signed-in management-portal administrator. */
export interface Admin {
  id?: string;
  email: string;
  role: string;
  /** Null for a platform administrator, who spans every organisation. */
  institution?: string | null;
}

export const SessionContext = createContext<Admin | null>(null);

/** The signed-in administrator, or null while the session is still loading. */
export function useAdmin(): Admin | null {
  return useContext(SessionContext);
}

/** A platform administrator is not scoped to a single organisation. */
export function isPlatformAdmin(admin: Admin | null): boolean {
  return Boolean(admin) && !admin?.institution;
}

/** Areas only the platform operator may open. */
const PLATFORM_ONLY = ['/shares', '/accounts'];

/** Areas that belong to a client organisation. */
const ORGANISATION_ONLY = ['/api-keys'];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** What a blocked area is limited to, for the message shown to a signed-in admin. */
export function restrictedTo(pathname: string): string {
  return matches(pathname, PLATFORM_ONLY) ? 'the platform operator' : 'client organisations';
}

/**
 * Whether this administrator may open a portal area. Hiding a page is presentation
 * only: the issuer service refuses the underlying calls, so this decides what is
 * shown rather than what is possible.
 */
export function canOpen(pathname: string, admin: Admin | null): boolean {
  if (!admin) return true;
  if (matches(pathname, PLATFORM_ONLY)) return isPlatformAdmin(admin);
  if (matches(pathname, ORGANISATION_ONLY)) return !isPlatformAdmin(admin);
  return true;
}
