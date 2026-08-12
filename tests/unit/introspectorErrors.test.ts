import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearIntrospectionCache, introspect } from "../../src/core/introspector.ts";

describe("Prisma introspection startup errors", () => {
   test("explains how to fix a missing consumer schema", async () => {
      clearIntrospectionCache();

      await expect(introspect({ schemaPath: "missing/schema.prisma" })).rejects.toThrow(
         'Could not read schema file at',
      );
   });

   test("identifies the supported Prisma range when DMMF generation fails", async () => {
      const directory = mkdtempSync(join(tmpdir(), "prisma-express-admin-invalid-schema-"));
      const schemaPath = join(directory, "schema.prisma");
      writeFileSync(schemaPath, "model User { id String @id invalid", "utf8");
      clearIntrospectionCache();

      await expect(introspect({ schemaPath })).rejects.toThrow("This release supports Prisma 7.5.x.");
   });
});
