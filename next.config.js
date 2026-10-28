/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      // Firmware/simulator endpoints live at /_api/parking/* to match the
      // device protocol, but Next API routes must live under /pages/api.
      {
        source: "/_api/parking/:path*",
        destination: "/api/device/parking/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
