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
};

module.exports = withPWA(nextConfig);


