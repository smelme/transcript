import { withSecurityHeaders } from '../shared-web/security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return withSecurityHeaders;
  },
};

export default nextConfig;
