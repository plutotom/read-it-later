/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: false,
  },
};

export default config;

// const withPWA = require('next-pwa')({
//   dest: 'public', // Destination directory for PWA files
//   register: true, // Register the service worker
//   skipWaiting: true, // Skip waiting for service worker activation
//   disable: process.env.NODE_ENV === 'development', // Disable PWA in development
// });

// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   // Your existing Next.js configuration
// };

// module.exports = withPWA(nextConfig);
