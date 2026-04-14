const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' }],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', 'react-markdown', '@supabase/supabase-js', 'remark-gfm'],
  },
  compress: true,
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
