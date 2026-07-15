import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Same-origin /api in dev so Chrome password-save form POSTs stay on :8080.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
      // Dev-only proxy to avoid CORS when calling WAHA directly.
      "/waha": {
        target: "http://72.60.200.185:3000",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/waha/, ""),
      },
      // Dev-only proxy to avoid CORS when calling n8n directly.
      "/n8n": {
        target: "http://72.60.200.185:5678",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/n8n/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
