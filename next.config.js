/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the trace root to this repo; Next otherwise walks up and can pick a
  // stray lockfile in a parent directory as the workspace root.
  outputFileTracingRoot: __dirname,
  images: {
    // T-101: `src/components/ui/Image.tsx` is the site's image optimizer, not
    // this one. §A-10.3's upload pipeline already resizes to 400/800px and
    // encodes AVIF + WebP + the source format once, at upload time; Next's
    // built-in optimizer would resize the same bytes a second time, on every
    // cold cache miss, from a `src` that is frequently a signed private URL
    // whose 15-minute TTL (§A-10.2) it has no way to renew mid-fetch.
    // `unoptimized: true` turns that optimizer off outright, which also means
    // `remotePatterns` is never consulted — nothing here needs to allowlist
    // the storage host.
    unoptimized: true,
  },
};

module.exports = nextConfig;
