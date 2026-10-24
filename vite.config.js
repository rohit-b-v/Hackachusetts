import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev-only middleware that mounts POST /api/plan on Vite's connect server so
 * the frontend can call the Gemma planner during `npm run dev`. The handler
 * reads GEMMA_API_KEY / GEMMA_MODEL from process.env ONLY; these are never
 * exposed to the client and never prefixed VITE_.
 */
function gemmaApiPlugin(env) {
  return {
    name: "gemma-api-middleware",
    apply: "serve",
    configureServer(server) {
      // Make server-side secrets available to the handler during dev without
      // exposing them to the client bundle (Vite only inlines VITE_* vars).
      if (env.GEMMA_API_KEY && !process.env.GEMMA_API_KEY) {
        process.env.GEMMA_API_KEY = env.GEMMA_API_KEY;
      }
      if (env.GEMMA_MODEL && !process.env.GEMMA_MODEL) {
        process.env.GEMMA_MODEL = env.GEMMA_MODEL;
      }
      server.middlewares.use(async (req, res, next) => {
        if ((req.url || "").split("?")[0] !== "/api/plan") return next();
        // Lazy import so the handler reads env set above.
        const { handleApi } = await import("./server/httpBridge.js");
        const handled = await handleApi(req, res);
        if (!handled) next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env (including non-VITE_) for server-side middleware use only.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), gemmaApiPlugin(env)],
    server: {
      port: 5173,
    },
  };
});
