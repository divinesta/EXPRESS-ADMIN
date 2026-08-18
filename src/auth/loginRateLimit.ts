import type { Request } from "express";
import type { BuiltInAuthConfig } from "../core/types.js";

type Attempt = { count: number; resetAt: number };
type Settings = { windowMs: number; maxAttempts: number };

const defaultWindowMs = 60_000;
const defaultMaxAttempts = 10;
const maximumTrackedKeys = 10_000;

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
   const attemptsByIp = new Map<string, Attempt>();
   const attemptsByIdentifier = new Map<string, Attempt>();

   const pruneExpired = (attempts: Map<string, Attempt>, now: number) => {
      for (const [key, attempt] of attempts) {
         if (attempt.resetAt <= now) attempts.delete(key);
      }
   };

   const consume = (attempts: Map<string, Attempt>, key: string, now: number): number | null => {
      const current = attempts.get(key);
      if (!current && attempts.size >= maximumTrackedKeys) return Math.ceil(settings!.windowMs / 1_000);

      const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + settings!.windowMs } : current;
      attempt.count += 1;
      attempts.set(key, attempt);
      return attempt.count > settings!.maxAttempts ? Math.max(1, Math.ceil((attempt.resetAt - now) / 1_000)) : null;
   };

   return (req, identifier) => {
      if (!settings) return null;

      const now = Date.now();
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      pruneExpired(attemptsByIp, now);
      pruneExpired(attemptsByIdentifier, now);

      const ipRetryAfter = consume(attemptsByIp, ip, now);
      if (ipRetryAfter !== null) return ipRetryAfter;
      return consume(attemptsByIdentifier, identifier.toLowerCase(), now);
   };
}
