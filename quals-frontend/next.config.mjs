import { withSecurityHeaders } from '../shared-web/security-headers.mjs';

/**
 * Quals serves one public page: the document a share link opens. Everything it needs from the
 * issuer is reached through `/api`, so the browser only ever talks to this site.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return withSecurityHeaders;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.ISSUER_API_URL || 'http://localhost:3000'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
