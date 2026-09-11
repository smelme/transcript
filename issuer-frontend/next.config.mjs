/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Android App Links verification file (values come from the environment).
      { source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' },
      {
        source: '/api/:path*',
        destination: `${process.env.ISSUER_API_URL || 'http://localhost:3000'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
