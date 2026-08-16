import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "prisma-express-admin-pack-"));
const packageDirectory = join(temporaryRoot, "package");
const consumerDirectory = join(temporaryRoot, "consumer");

async function run(command, args, cwd) {
  await execFileAsync(command, args, {
    cwd,
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
    timeout: 120_000,
  });
}

try {
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(join(consumerDirectory, "prisma"), { recursive: true });
  await run("npm", ["pack", "--pack-destination", packageDirectory], repositoryRoot);
  const packedFiles = await readdir(packageDirectory);
  const tarball = packedFiles.find((file) => file.endsWith(".tgz"));
  assert.ok(tarball, "npm pack did not create a tarball");

  await run("npm", ["init", "--yes"], consumerDirectory);
  await run(
    "npm",
    [
      "install",
      "--no-package-lock",
      "--no-save",
      "--prefer-offline",
      join(packageDirectory, tarball),
      "express@^5.0.0",
      "prisma@7.5.0",
      "@prisma/client@7.5.0",
      "@prisma/adapter-pg@7.5.0",
      "pg@^8.0.0",
    ],
    consumerDirectory,
  );

  await writeFile(
    join(consumerDirectory, "prisma.config.ts"),
    `import { defineConfig } from "prisma/config";\n\nexport default defineConfig({\n  schema: "prisma/schema.prisma",\n  datasource: { url: "postgresql://postgres:postgres@127.0.0.1:5435/express_admin" },\n});\n`,
  );
  await writeFile(
    join(consumerDirectory, "prisma", "schema.prisma"),
    `generator client {\n  provider = "prisma-client"\n  output   = "../generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nmodel User {\n  id    String @id @default(cuid())\n  email String @unique\n}\n`,
  );
  await run(
    "npm",
    ["exec", "--", "prisma", "generate", "--config", "prisma.config.ts", "--schema", "prisma/schema.prisma"],
    consumerDirectory,
  );
  await access(join(consumerDirectory, "generated", "prisma", "client.js"));

  await writeFile(
    join(consumerDirectory, "verify.mjs"),
    `import assert from "node:assert/strict";\nimport { once } from "node:events";\nimport express from "express";\nimport { PrismaPg } from "@prisma/adapter-pg";\nimport { PrismaClient } from "./generated/prisma/client.js";\nimport { createAdmin } from "prisma-express-admin";\n\nconst prisma = new PrismaClient({\n  adapter: new PrismaPg({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5435/express_admin" }),\n});\nconst app = express();\nconst admin = createAdmin({\n  prisma,\n  databaseProvider: "postgresql",\n  auth: { getCurrentUser: async () => ({ id: "smoke-test", role: "ADMIN" }) },\n});\nadmin.register("User");\nawait admin.mount(app);\nconst server = app.listen(0, "127.0.0.1");\nawait once(server, "listening");\ntry {\n  const address = server.address();\n  assert.ok(address && typeof address !== "string");\n  const response = await fetch(\`http://127.0.0.1:\${address.port}/admin/\`);\n  assert.equal(response.status, 200);\n  assert.match(await response.text(), /<div id="root"><\\/div>/);\n} finally {\n  server.close();\n  await once(server, "close");\n  await prisma.$disconnect();\n}\n`,
  );
  await run("node", ["verify.mjs"], consumerDirectory);
  console.log("Pack smoke test passed: tarball installed and mounted in a fresh Prisma consumer.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
