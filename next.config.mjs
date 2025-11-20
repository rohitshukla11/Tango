import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config, { isServer, webpack }) => {
    // Shim optional React Native AsyncStorage used by some browser SDKs (e.g., MetaMask)
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": path.resolve(process.cwd(), "shims/asyncStorage.ts"),
      "react-native-async-storage/async-storage": path.resolve(process.cwd(), "shims/asyncStorage.ts")
    };

    // Ignore pino-pretty optional dependency warnings
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/pino/,
        message: /Can't resolve 'pino-pretty'/,
      },
      // Ignore all warnings from blocklock-js during webpack compilation
      // These occur during module hashing and don't affect runtime
      {
        module: /node_modules\/blocklock-js/,
      },
    ];

    // Externalize blocklock-js for server-side builds to avoid Buffer issues
    // blocklock-js is only used in client components, so it should never be needed server-side
    if (isServer) {
      // Ensure externals is an array
      if (!Array.isArray(config.externals)) {
        config.externals = config.externals ? [config.externals] : [];
      }
    
      // Add blocklock-js to externals
      config.externals.push({
        'blocklock-js': 'commonjs blocklock-js'
      });
    } else {
      // For client-side builds, add Buffer polyfill if available
      try {
        const bufferPath = require.resolve('buffer/');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
          buffer: bufferPath,
      util: false,
    };

        // Provide Buffer globally for blocklock-js
        config.plugins = config.plugins || [];
        config.plugins.push(
          new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
          })
        );
      } catch (e) {
        // Buffer package might not be available, skip polyfill
        // This is okay - blocklock-js should work without it in browser
      }
    }

    // Disable problematic optimizations that cause Buffer issues during hashing
      config.optimization = config.optimization || {};
      config.optimization.providedExports = false;

    return config;
  }
};

export default nextConfig;
