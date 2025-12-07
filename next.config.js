const path = require("path");
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Add empty turbopack config to allow webpack configs from next-pwa
  turbopack: {
    root: __dirname,
  },
  // Externalize tesseract.js for server-side to prevent bundling issues
  serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core'],
  webpack: (config, { isServer }) => {
    // Fix for tesseract.js worker scripts in Next.js
    if (isServer) {
      // Server-side: externalize tesseract.js to prevent bundling
      // This allows tesseract.js to use its own worker scripts at runtime
      config.externals = config.externals || [];
      
      // Externalize tesseract.js and its dependencies
      config.externals.push({
        'tesseract.js': 'commonjs tesseract.js',
        'tesseract.js-core': 'commonjs tesseract.js-core',
      });
      
      // Ignore canvas and fs in server-side builds
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
      };
      
      // Preserve __dirname and __filename for path resolution
      config.node = {
        ...config.node,
        __dirname: true,
        __filename: true,
      };
    } else {
      // Client-side: handle worker scripts
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    
    return config;
  },
};

module.exports = withPWA(nextConfig);


