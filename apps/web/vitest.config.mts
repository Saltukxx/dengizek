import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Node 22.11'de require(esm) bayrak gerektirir (22.12+ varsayılan açık) —
// jsdom'un @csstools bağımlılığı için zorunlu. Worker süreçleri bu env'i
// ana süreçten devralır.
const flag = "--experimental-require-module";
const major = Number(process.versions.node.split(".")[0]);
const minor = Number(process.versions.node.split(".")[1]);
if (major < 23 && !(major === 22 && minor >= 12) && !process.env.NODE_OPTIONS?.includes(flag)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, flag].filter(Boolean).join(" ");
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
