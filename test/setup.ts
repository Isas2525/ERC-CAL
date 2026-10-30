import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { _resetKeyCache } from "../src/auth";

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM code_history"),
    env.DB.prepare("DELETE FROM vehicles"),
    env.DB.prepare("DELETE FROM unlock_codes"),
  ]);
  _resetKeyCache();
});
