import { withSecurityHeaders } from '../shared-web/security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return withSecurityHeaders;
  },
  async rewrites() {
    const api = process.env.VERIFIER_API_URL || 'http://localhost:3001';
    return [
      // /api/* -> verifier service (prefix stripped, matching legacy Vite proxy)
      { source: '/api/:path*', destination: `${api}/:path*` },
      // /verify/* and /registry/* -> verifier service (same-origin, no CORS)
      { source: '/verify/:path*', destination: `${api}/verify/:path*` },
      { source: '/registry/:path*', destination: `${api}/registry/:path*` },
    ];
  },
};

export default nextConfig;
