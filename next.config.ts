import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    turbopack: {
        root: __dirname,
        resolveAlias: {
            'phirepass-channel_bg.wasm': 'phirepass-channel/phirepass-channel_bg.wasm',
        },
    },
};

export default nextConfig;
