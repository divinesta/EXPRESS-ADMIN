import { once } from "node:events";
import express from "express";
import { afterEach, describe, expect, test } from "bun:test";
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
      const protectedResponse = await fetch(`${baseUrl}/api/protected`, { headers: { Cookie: cookie ?? "" } });
      expect(protectedResponse.status).toBe(200);
      expect(await protectedResponse.json()).toEqual({ email: "owner@example.test" });
   });
});
