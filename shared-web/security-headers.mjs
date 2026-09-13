/**
 * Security headers, shared by every Next app in this repository.
 *
 * The CSP is deliberately narrow rather than complete: `frame-ancestors`, `base-uri` and
 * `object-src` cannot break a page that Next already renders, so they are safe to enforce today
 * and they close clickjacking and base-tag injection. A `script-src` policy is a build-time
 * concern — it has to account for how a production build inlines and preloads — and belongs with
 * the build work in P1-01 rather than being guessed at here.
 */
export const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  // These deployments are demonstrations: a fictional university, sample transcripts and a demo
  // portal that accepts whatever a tester types. None of it should be indexable. Remove this line,
  // and the app/robots.ts beside each app, before a production deployment.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

export const withSecurityHeaders = [
  {
    source: '/:path*',
    headers: securityHeaders,
  },
];
