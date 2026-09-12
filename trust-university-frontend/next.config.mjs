/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // The page never talks to the verifier service directly: /api/* is proxied server-side, so
    // the browser sees one origin and the verifier sees one origin.
    const api = process.env.VERIFIER_API_URL || 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${api}/:path*` }];
  },
};

export default nextConfig;
