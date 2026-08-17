import { once } from "node:events";
import express from "express";
import { afterEach, describe, expect, test } from "bun:test";
import { createAdmin } from "../../src/index.ts";
import { createBuiltInAuthenticationMiddleware, createBuiltInAuthRouter, hashAdminPassword, verifyAdminPassword } from "../../src/auth/builtIn.ts";
import type { BuiltInAuthConfig } from "../../src/core/types.ts";

const config: BuiltInAuthConfig = { mode: "built-in", identifier: "email", secureCookies: false };
const servers: import("node:http").Server[] = [];

afterEach(async () => {
   await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
   }));
});

describe("built-in admin authentication", () => {
   test("hashes and verifies passwords", async () => {
      const hash = await hashAdminPassword("a long password for testing");
      expect(await verifyAdminPassword("a long password for testing", hash)).toBe(true);
      expect(await verifyAdminPassword("not the password", hash)).toBe(false);
      expect(await verifyAdminPassword("a long password for testing", "scrypt$1048576$8$1$salt$invalid")).toBe(false);
   });

   test("creates an admin-only session and protects API routes", async () => {
      const passwordHash = await hashAdminPassword("a long password for testing");
      const users = [{ id: "admin-1", email: "owner@example.test", passwordHash, role: "SUPER_ADMIN", isActive: true }];
      const sessions: Array<{ tokenHash: string; userId: string; expiresAt: Date }> = [];
      const prisma = {
         expressAdminUser: { findUnique: async ({ where }: { where: { email: string } }) => users.find((user) => user.email === where.email) ?? null },
         expressAdminSession: {
            create: async ({ data }: { data: { tokenHash: string; userId: string; expiresAt: Date } }) => { sessions.push(data); return data; },
            findFirst: async ({ where }: { where: { tokenHash: string; expiresAt: { gt: Date } } }) => {
               const session = sessions.find((entry) => entry.tokenHash === where.tokenHash && entry.expiresAt > where.expiresAt.gt);
               return session ? { ...session, user: users.find((user) => user.id === session.userId) } : null;
            },
            deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
               const index = sessions.findIndex((entry) => entry.tokenHash === where.tokenHash);
               if (index >= 0) sessions.splice(index, 1);
               return { count: index >= 0 ? 1 : 0 };
            },
         },
      };
      const app = express();
      app.use(express.json());
      app.use("/api/auth", createBuiltInAuthRouter(prisma, config));
      app.get("/api/protected", createBuiltInAuthenticationMiddleware(prisma, config), (req, res) => res.json({ email: req.adminUser?.email }));
      const server = app.listen(0, "127.0.0.1");
      servers.push(server);
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      expect((await fetch(`${baseUrl}/api/protected`)).status).toBe(401);
      const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "owner@example.test", password: "a long password for testing" }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie");
      expect(cookie).toContain("express_admin_session=");
      expect(cookie).toContain("Path=/admin");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      const protectedResponse = await fetch(`${baseUrl}/api/protected`, { headers: { Cookie: cookie ?? "" } });
      expect(protectedResponse.status).toBe(200);
      expect(await protectedResponse.json()).toEqual({ email: "owner@example.test" });

      const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie ?? "" } });
      expect(logout.status).toBe(204);
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
      expect((await fetch(`${baseUrl}/api/protected`, { headers: { Cookie: cookie ?? "" } })).status).toBe(401);
   });

   test("rejects inactive and non-admin accounts without exposing the reason", async () => {
      const passwordHash = await hashAdminPassword("a long password for testing");
      const users = [
         { id: "inactive", email: "inactive@example.test", passwordHash, role: "ADMIN", isActive: false },
         { id: "member", email: "member@example.test", passwordHash, role: "USER", isActive: true },
      ];
      const app = express();
      app.use(express.json());
      app.use("/api/auth", createBuiltInAuthRouter({
         expressAdminUser: { findUnique: async ({ where }: { where: { email: string } }) => users.find((user) => user.email === where.email) ?? null },
         expressAdminSession: { create: async () => null, findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
      }, config));
      const server = app.listen(0, "127.0.0.1");
      servers.push(server);
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      for (const identifier of ["inactive@example.test", "member@example.test", "missing@example.test"]) {
         const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password: "a long password for testing" }) });
         expect(response.status).toBe(401);
         expect(await response.json()).toEqual({ error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
      }
   });

   test("uses the configured base path for session cookies", async () => {
      const passwordHash = await hashAdminPassword("a long password for testing");
      const app = express();
      app.use(express.json());
      app.use("/api/auth", createBuiltInAuthRouter({
         expressAdminUser: { findUnique: async () => ({ id: "admin-1", email: "owner@example.test", passwordHash, role: "SUPER_ADMIN", isActive: true }) },
         expressAdminSession: { create: async () => null, findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
      }, config, "/ops"));
      const server = app.listen(0, "127.0.0.1");
      servers.push(server);
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "owner@example.test", password: "a long password for testing" }) });
      expect(response.headers.get("set-cookie")).toContain("Path=/ops");
   });

   test("throttles repeated sign-in attempts", async () => {
      const app = express();
      app.use(express.json());
      app.use("/api/auth", createBuiltInAuthRouter({
         expressAdminUser: { findUnique: async () => null },
         expressAdminSession: { create: async () => null, findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
      }, { ...config, loginRateLimit: { maxAttempts: 1, windowMs: 60_000 } }));
      const server = app.listen(0, "127.0.0.1");
      servers.push(server);
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");
      const url = `http://127.0.0.1:${address.port}/api/auth/login`;
      const request = () => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "throttle@example.test", password: "a long password for testing" }) });

      expect((await request()).status).toBe(401);
      const limited = await request();
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
   });

   test("refuses to expose built-in authentication models", async () => {
      const admin = createAdmin({ prisma: {} as never, schemaPath: "examples/basic/prisma/schema.prisma", auth: config });
      admin.register("ExpressAdminUser");
      await expect(admin.mount(express())).rejects.toThrow('Built-in auth model "ExpressAdminUser" cannot be registered');
   });
});
