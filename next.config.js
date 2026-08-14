/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the trace root to this repo; Next otherwise walks up and can pick a
  // stray lockfile in a parent directory as the workspace root.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
