// A demonstration verification service, not a public site: keep it out of search results.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
