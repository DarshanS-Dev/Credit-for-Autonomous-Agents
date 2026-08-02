/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  async rewrites() {
    // Proxies every /api/* call to the FastAPI backend server-side, so the
    // browser only ever talks to same-origin Next.js. Avoids needing CORS
    // middleware on the backend (which we can't add — frontend-only change).
    const backendUrl =
      process.env.BACKEND_URL ?? "https://credit-for-autonomous-agents.onrender.com";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
