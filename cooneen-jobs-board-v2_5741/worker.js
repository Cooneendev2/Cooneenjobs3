/**
 * worker.js
 * Entry point used ONLY when the project is deployed as a Cloudflare Worker with static assets
 * (the "Workers" deployment that gives you a *.workers.dev address, configured in wrangler.jsonc).
 * Cloudflare Pages ignores this file and runs functions/api/jobs.js by itself.
 *
 * - /api/jobs        -> the same handler Pages would run from functions/api/jobs.js
 * - everything else  -> the static files (index.html, admin.html, assets/...)
 *
 * Only the exact path /api/jobs reaches the handler, and the handler's upstream address is a constant
 * inside functions/api/jobs.js, so nothing in a request can make this Worker fetch anything else.
 */
import { onRequest } from './functions/api/jobs.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/jobs') {
      return onRequest({
        request: request,
        env: env,
        waitUntil: function (promise) {
          ctx.waitUntil(promise);
        }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
