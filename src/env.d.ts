// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
interface Env {
  ALLOWED_EMAILS?: string;
}
