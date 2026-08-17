import type { Request } from "express";
import type { BuiltInAuthConfig } from "../core/types.js";

type Attempt = { count: number; resetAt: number };
type Settings = { windowMs: number; maxAttempts: number };

const defaultWindowMs = 60_000;
const defaultMaxAttempts = 10;

const clientKey = (req: Request, identifier: string): string => `${req.ip}:${identifier.toLowerCase()}`;

function resolveSettings(config: BuiltInAuthConfig): Settings | null {
   if (config.loginRateLimit === false) return null;

   const settings = {
      windowMs: config.loginRateLimit?.windowMs ?? defaultWindowMs,
      maxAttempts: config.loginRateLimit?.maxAttempts ?? defaultMaxAttempts,
   };
   if (!Number.isSafeInteger(settings.windowMs) || settings.windowMs <= 0) throw new Error("[prisma-express-admin] loginRateLimit.windowMs must be a positive integer.");
   if (!Number.isSafeInteger(settings.maxAttempts) || settings.maxAttempts <= 0) throw new Error("[prisma-express-admin] loginRateLimit.maxAttempts must be a positive integer.");
   return settings;
}

/** Create a limiter scoped to one mounted admin router. */
export function createLoginRateLimiter(config: BuiltInAuthConfig): (req: Request, identifier: string) => number | null {
   const settings = resolveSettings(config);
   const attempts = new Map<string, Attempt>();

   return (req, identifier) => {
      if (!settings) return null;

      const now = Date.now();
      const key = clientKey(req, identifier);
      const current = attempts.get(key);
      const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + settings.windowMs } : current;
      attempt.count += 1;
      attempts.set(key, attempt);

      if (attempts.size > 10_000) {
         for (const [storedKey, storedAttempt] of attempts) {
            if (storedAttempt.resetAt <= now) attempts.delete(storedKey);
         }
      }

      return attempt.count > settings.maxAttempts ? Math.max(1, Math.ceil((attempt.resetAt - now) / 1_000)) : null;
   };
}
