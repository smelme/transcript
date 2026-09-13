// Trust University is a fictional institution used to demonstrate verification. It must not be
// indexed: a made-up university appearing in search results is worse than no listing at all.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
