import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  transpilePackages: [
    '@web3-storage/data-segment',
    'cborg',
    '@filoz/synapse-sdk'
  ],
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

    // Fix for @web3-storage/data-segment and cborg webpack issues
    // Configure resolve to properly handle these ESM modules
    config.resolve = config.resolve || {};
    config.resolve.fullySpecified = false;
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
    };

    // Externalize problematic modules for server-side builds
    // These are only used in API routes via Synapse SDK
    if (isServer) {
      // Ensure externals is an array
      if (!Array.isArray(config.externals)) {
        config.externals = config.externals ? [config.externals] : [];
      }
    
      // Add blocklock-js to externals
      config.externals.push({
        'blocklock-js': 'commonjs blocklock-js'
      });
      
      // Externalize web3-storage and cborg to avoid webpack export analysis issues
      // These will be available at runtime via node_modules
      const web3StoragePattern = /^(@web3-storage\/data-segment|cborg|@filoz\/synapse-sdk)$/;
      const originalExternal = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternal) ? originalExternal : [originalExternal]),
        ({ request }, callback) => {
          if (web3StoragePattern.test(request)) {
            return callback(null, `commonjs ${request}`);
          }
          if (typeof originalExternal === 'function') {
            return originalExternal({ request }, callback);
          }
          callback();
        }
      ];
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

    // Disable problematic optimizations that cause Buffer and cborg issues
    config.optimization = config.optimization || {};
    config.optimization.providedExports = false;
    config.optimization.usedExports = false;
    config.optimization.concatenateModules = false;
    
    // Ignore warnings from web3-storage and cborg
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/@web3-storage/,
      },
      {
        module: /node_modules\/cborg/,
      },
      {
        module: /node_modules\/@web3-storage\/data-segment/,
      },
      // Ignore the specific cborg export error
      {
        module: /node_modules\/cborg\/cborg\.js/,
        message: /Cannot get final name for export/,
      },
    ];

    return config;
  }
};

export default nextConfig;
