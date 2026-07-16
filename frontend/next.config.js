const path = require('path');

function preconnectLinkHeader() {
  const links = [];
  const api = process.env.NEXT_PUBLIC_API_URL?.trim();
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  try {
    if (api) links.push(`<${new URL(api).origin}>; rel=preconnect; crossorigin`);
  } catch {
    /* ignore */
  }
  try {
    if (supa) links.push(`<${new URL(supa).origin}>; rel=preconnect; crossorigin`);
  } catch {
    /* ignore */
  }
  return links.length ? links.join(', ') : null;
}

const preconnectHeader = preconnectLinkHeader();

/**
 * Next.js config: `optimizePackageImports` shrinks barrel imports; webpack alias `@` mirrors tsconfig paths
 * when using `next dev/build --webpack`.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' }],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', 'react-markdown', '@supabase/supabase-js', 'remark-gfm'],
  },
  compress: true,
  async headers() {
    if (!preconnectHeader) return [];
    const link = [{ key: 'Link', value: preconnectHeader }];
    return [
      { source: '/dashboard/:path*', headers: link },
      { source: '/start', headers: link },
      { source: '/start/:path*', headers: link },
      { source: '/auth/:path*', headers: link },
    ];
  },
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/favicon.svg' }];
  },
  webpack: (config, { dir }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.join(dir, 'src'),
    };
    return config;
  },
};

module.exports = nextConfig;
