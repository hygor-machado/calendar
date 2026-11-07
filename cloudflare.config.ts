import { defineConfig } from "cf/config";

// Worker só de arquivos estáticos: serve a pasta public/ (veja wrangler.config.ts).
export default defineConfig({
  worker: {
    name: "calendar",
    compatibilityDate: "2026-11-04",
    observability: {
      enabled: true
    }
  }
});
