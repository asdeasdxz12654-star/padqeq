import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // PGlite는 첫 실행 때 WASM을 불러오느라 느리다
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
