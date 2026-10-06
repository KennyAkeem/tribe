/** @type {import('next').NextConfig} */
const nextConfig = {
	distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
	images: {
		remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
	},
};

export default nextConfig;
