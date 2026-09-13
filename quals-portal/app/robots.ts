import type { MetadataRoute } from 'next';

// The management portal of a demonstration system: it must not appear in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
