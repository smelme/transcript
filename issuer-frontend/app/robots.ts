import type { MetadataRoute } from 'next';

// This is a demonstration issuing authority: sample students, sample transcripts. Nothing here
// belongs in a search index. `/.well-known/` stays allowed because Android fetches the App Links
// association file from it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
      allow: '/.well-known/',
    },
  };
}
