/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // ✅ Force cache bust on every build
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
  
  // ✅ Disable caching in production
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
