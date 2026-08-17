import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { AdminUser, BuiltInAuthConfig, PrismaLike } from "../core/types.js";
import { createLoginRateLimiter } from "./loginRateLimit.js";
import { hashAdminPassword, verifyAdminPassword, verifyLoginPassword } from "./passwords.js";

export { hashAdminPassword, verifyAdminPassword } from "./passwords.js";
const sessionCookieName = "express_admin_session";
const defaultSessionTtlSeconds = 60 * 60 * 24 * 7;

type Delegate = {
   findUnique(args: unknown): Promise<unknown>;
   findFirst(args: unknown): Promise<unknown>;
   create(args: unknown): Promise<unknown>;
   deleteMany(args: unknown): Promise<unknown>;
};

type BuiltInRecord = {
   id: string;
   email?: string;
   username?: string;
   passwordHash: string;
   role: string;
   isActive: boolean;
   tenantId?: string;
};

const modelKey = (modelName: string) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

const delegateFor = (prisma: PrismaLike, modelName: string): Delegate => {
   const delegate = (prisma as Record<string, unknown>)[modelKey(modelName)];
   if (!delegate || typeof delegate !== "object") {
      throw new Error(`[prisma-express-admin] Built-in auth requires a Prisma delegate for model "${modelName}".`);
   }
   return delegate as Delegate;
};

const readCookie = (req: Request, name: string): string | null => {
   const header = req.headers.cookie;
   if (!header) return null;
   for (const part of header.split(";")) {
      const [key, ...value] = part.trim().split("=");
      if (key === name) return decodeURIComponent(value.join("="));
   }
   return null;
};

const sessionHash = (token: string) => createHash("sha256").update(token).digest("hex");

const serializeSessionCookie = (token: string, config: BuiltInAuthConfig, basePath: string, expires: Date): string => {
   const secure = config.secureCookies ?? process.env.NODE_ENV === "production";
   return [
      `${sessionCookieName}=${encodeURIComponent(token)}`,
      `Path=${basePath}`,
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))}`,
      `Expires=${expires.toUTCString()}`,
      secure ? "Secure" : "",
   ].filter(Boolean).join("; ");
};

const clearSessionCookie = (config: BuiltInAuthConfig, basePath: string): string => {
   const secure = config.secureCookies ?? process.env.NODE_ENV === "production";
   return [`${sessionCookieName}=`, `Path=${basePath}`, "HttpOnly", "SameSite=Lax", "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", secure ? "Secure" : ""].filter(Boolean).join("; ");
};

const toAdminUser = (user: BuiltInRecord): AdminUser | null => {
   if (!user.isActive || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) return null;
   return {
      id: user.id,
      email: user.email ?? user.username ?? user.id,
      ...(user.username ? { username: user.username } : {}),
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      role: user.role,
      isSuperAdmin: user.role === "SUPER_ADMIN",
   };
};

export const isBuiltInAuth = (auth: import("../core/types.js").AuthConfig): auth is BuiltInAuthConfig => auth.mode === "built-in";

export const getBuiltInAdminUser = async (req: Request, prisma: PrismaLike, config: BuiltInAuthConfig): Promise<AdminUser | null> => {
   const token = readCookie(req, sessionCookieName);
   if (!token) return null;
   const sessions = delegateFor(prisma, config.sessionModel ?? "ExpressAdminSession");
   const session = await sessions.findFirst({
      where: { tokenHash: sessionHash(token), expiresAt: { gt: new Date() } },
      include: { user: true },
   }) as { user?: BuiltInRecord } | null;
   return session?.user ? toAdminUser(session.user) : null;
};

export const createBuiltInAuthRouter = (prisma: PrismaLike, config: BuiltInAuthConfig, basePath = "/admin"): RequestHandler => {
   const users = delegateFor(prisma, config.userModel ?? "ExpressAdminUser");
   const sessions = delegateFor(prisma, config.sessionModel ?? "ExpressAdminSession");
   const ttlSeconds = config.sessionTtlSeconds ?? defaultSessionTtlSeconds;
   const consumeLoginAttempt = createLoginRateLimiter(config);

   return async (req, res, next) => {
      if (req.method === "GET" && req.path === "/config") {
         res.json({ identifier: config.identifier });
         return;
      }

      if (req.method === "POST" && req.path === "/login") {
         try {
            const body = req.body as { identifier?: unknown; password?: unknown };
            const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
            const password = typeof body?.password === "string" ? body.password : "";
            if (!identifier || !password || identifier.length > 254 || password.length > 1_024) {
               res.status(401).json({ error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
               return;
            }

            const retryAfter = consumeLoginAttempt(req, identifier);
            if (retryAfter !== null) {
               res.setHeader("Retry-After", String(retryAfter));
               res.status(429).json({ error: "Too many sign-in attempts. Please try again later.", code: "LOGIN_RATE_LIMITED" });
               return;
            }

            const user = await users.findUnique({ where: { [config.identifier]: identifier } }) as BuiltInRecord | null;
            const passwordMatches = await verifyLoginPassword(password, user?.passwordHash);
            const adminUser = user && passwordMatches ? toAdminUser(user) : null;
            if (!user || !adminUser) {
               res.status(401).json({ error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
               return;
            }

            const token = randomBytes(32).toString("base64url");
            const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
            await sessions.create({ data: { tokenHash: sessionHash(token), userId: user.id, expiresAt } });
            res.setHeader("Set-Cookie", serializeSessionCookie(token, config, basePath, expiresAt));
            res.status(200).json({ ok: true });
            return;
         } catch (error) {
            next(error);
            return;
         }
      }

      if (req.method === "POST" && req.path === "/logout") {
         try {
            const token = readCookie(req, sessionCookieName);
            if (token) await sessions.deleteMany({ where: { tokenHash: sessionHash(token) } });
            res.setHeader("Set-Cookie", clearSessionCookie(config, basePath));
            res.status(204).end();
            return;
         } catch (error) {
            next(error);
            return;
         }
      }

      next();
   };
};

export const createBuiltInAuthenticationMiddleware = (prisma: PrismaLike, config: BuiltInAuthConfig): RequestHandler => async (req, res, next) => {
   try {
      const adminUser = await getBuiltInAdminUser(req, prisma, config);
      if (!adminUser) {
         res.status(401).json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
         return;
      }
      req.adminUser = adminUser;
      next();
   } catch {
      res.status(401).json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
   }
};

export const enforceBuiltInAdminPage = (prisma: PrismaLike, config: BuiltInAuthConfig, basePath: string): RequestHandler => async (req, res, next) => {
   // The SPA's JavaScript and CSS must load before React can render /login.
   // Guard pages and APIs, not the static bundle that powers them.
   if (req.path === "/login" || req.path.startsWith("/api/") || req.path.startsWith("/assets/")) {
      next();
      return;
   }
   const adminUser = await getBuiltInAdminUser(req, prisma, config);
   if (!adminUser) {
      res.redirect(`${basePath}/login`);
      return;
   }
   next();
};
