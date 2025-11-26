import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: "node18",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/utils/setup.ts"],
    server: {
      deps: {
        inline: ["@tanstack/react-query"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "__tests__/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
        ".next/**",
        "public/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});

