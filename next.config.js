/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Externalize sharp and moondream to avoid bundling issues
  serverExternalPackages: ['sharp', 'moondream'],
};

module.exports = nextConfig;


