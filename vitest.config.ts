import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Tests run with auth on unless a test opts out; see test/helpers.ts.
          bindings: { TEST_MIGRATIONS: migrations, AUTH_DISABLED: "" },
        },
      }),
    ],
    test: { setupFiles: ["./test/setup.ts"] },
  };
});
