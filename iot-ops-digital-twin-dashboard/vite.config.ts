import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    server: {
      port: 5173, // Use Vite's default port to avoid conflicts
      host: "0.0.0.0",
      // Proxy API requests to the middleware during development
      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          // Handle preflight OPTIONS requests
          onProxyReq: (proxyReq, res, next) => {
            if (proxyReq.method === "OPTIONS") {
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader(
                "Access-Control-Allow-Methods",
                "GET, POST, OPTIONS",
              );
              res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization",
              );
              res.sendStatus(200);
            } else {
              next();
            }
          },
        },
        // WebSocket proxy for development
        "/ws": {
          target:
            env.VITE_WS_URL?.replace("ws://", "http://") ||
            "http://localhost:3001",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    plugins: [react()],
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@components": path.resolve(__dirname, "./components"),
        "@hooks": path.resolve(__dirname, "./hooks"),
        "@store": path.resolve(__dirname, "./store"),
        "@types": path.resolve(__dirname, "./types"),
        "@utils": path.resolve(__dirname, "./utils"),
        "@api": path.resolve(__dirname, "./src/api"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            zustand: ["zustand"],
            lucide: ["lucide-react"],
            axios: ["axios"],
          },
        },
      },
    },
  };
});
