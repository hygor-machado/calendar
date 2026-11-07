import { defineWranglerConfig } from "wrangler/experimental-config";

// Só a pasta public/ vai para o Cloudflare: página, demonstração e o componente.
export default defineWranglerConfig({
  assetsDirectory: "public"
});
