#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashAdminPassword } from "./auth/builtIn.js";
import type { ExpressAdminCliConfig, PrismaLike } from "./core/types.js";

const emailSchema = `enum ExpressAdminRole {
  ADMIN
  SUPER_ADMIN
}

model ExpressAdminUser {
  id           String           @id @default(cuid())
  email        String           @unique
  passwordHash String
  role         ExpressAdminRole @default(ADMIN)
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  sessions     ExpressAdminSession[]
}

model ExpressAdminSession {
  id        String           @id @default(cuid())
  tokenHash String           @unique
  userId    String
  user      ExpressAdminUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime         @default(now())

  @@index([userId])
  @@index([expiresAt])
}`;

const usernameSchema = emailSchema.replace("email        String           @unique", "username     String           @unique");

const usage = (): void => {
   console.log(`Usage:
  prisma-express-admin auth:schema --identifier <email|username>
  prisma-express-admin createsuperuser --config ./express-admin.config.mjs [--identifier value] [--password value]

The config module must default-export { prisma, auth }, where auth is a built-in auth configuration.`);
};

const modelKey = (modelName: string) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

const argument = (name: string): string | undefined => {
   const index = process.argv.indexOf(name);
   return index >= 0 ? process.argv[index + 1] : undefined;
};

const question = async (label: string): Promise<string> => {
   const terminal = createInterface({ input: stdin, output: stdout });
   try {
      return (await terminal.question(label)).trim();
   } finally {
      terminal.close();
   }
};

const confirm = async (label: string): Promise<boolean> => {
   const answer = (await question(`${label} [y/N]: `)).toLowerCase();
   return answer === "y" || answer === "yes";
};

const hiddenQuestion = async (label: string): Promise<string> => {
   if (!stdin.isTTY) throw new Error("Password input requires a terminal. Pass --password or set EXPRESS_ADMIN_PASSWORD for non-interactive use.");
   stdout.write(label);
   return new Promise((resolveQuestion, rejectQuestion) => {
      let value = "";
      const restore = () => {
         stdin.setRawMode(false);
         stdin.pause();
         stdin.off("data", onData);
      };
      const onData = (chunk: Buffer) => {
         for (const character of chunk.toString("utf8")) {
            if (character === "\r" || character === "\n") {
               restore();
               stdout.write("\n");
               resolveQuestion(value);
               return;
            }
            if (character === "\u0003") {
               restore();
               rejectQuestion(new Error("Cancelled."));
               return;
            }
            if (character === "\b" || character === "\u007f") {
               if (value) {
                  value = value.slice(0, -1);
                  stdout.write("\b \b");
               }
               continue;
            }
            value += character;
            stdout.write("•");
         }
      };
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
   });
};

const loadConfig = async (configPath: string): Promise<ExpressAdminCliConfig> => {
   const module = await import(pathToFileURL(resolve(configPath)).href);
   const config = module.default as ExpressAdminCliConfig | undefined;
   if (!config?.prisma || config.auth?.mode !== "built-in") throw new Error("The config must default-export { prisma, auth: { mode: \"built-in\", ... } }.");
   return config;
};

const createSuperuser = async (): Promise<void> => {
   const configPath = argument("--config");
   if (!configPath) throw new Error("createsuperuser requires --config ./express-admin.config.mjs");
   const config = await loadConfig(configPath);
   try {
      const identifierName = config.auth.identifier;
      const identifier = argument(`--${identifierName}`) ?? await question(`${identifierName === "email" ? "Email" : "Username"}: `);
      const suppliedPassword = argument("--password") ?? process.env.EXPRESS_ADMIN_PASSWORD;
      const password = suppliedPassword ?? await hiddenQuestion("Password: ");
      if (!suppliedPassword) {
         const confirmation = await hiddenQuestion("Confirm password: ");
         if (password !== confirmation) throw new Error("Passwords do not match.");
      }
      if (!identifier || identifier.length > 254) throw new Error(`A valid ${identifierName} is required.`);
      if (!password) throw new Error("Password cannot be empty.");
      if (password.length < 12) {
         const warning = "This password is shorter than the recommended 12 characters. Continue anyway?";
         if (suppliedPassword) console.warn(`Warning: ${warning}`);
         else if (!(await confirm(warning))) throw new Error("Superuser creation cancelled.");
      }

      const delegate = (config.prisma as Record<string, unknown>)[modelKey(config.auth.userModel ?? "ExpressAdminUser")] as { create(args: unknown): Promise<unknown> } | undefined;
      if (!delegate) throw new Error(`Prisma client has no delegate for ${config.auth.userModel ?? "ExpressAdminUser"}. Generate your Prisma client after adding the auth schema.`);
      await delegate.create({ data: { [identifierName]: identifier, passwordHash: await hashAdminPassword(password), role: "SUPER_ADMIN", isActive: true } });
      console.log(`Superuser created. Sign in at /admin/login with your ${identifierName}.`);
   } finally {
      const disconnect = (config.prisma as { $disconnect?: () => Promise<void> }).$disconnect;
      if (disconnect) await disconnect.call(config.prisma);
   }
};

const command = process.argv[2];
try {
   if (command === "auth:schema") {
      const identifier = argument("--identifier");
      if (identifier !== "email" && identifier !== "username") throw new Error("auth:schema requires --identifier email or --identifier username");
      console.log(identifier === "email" ? emailSchema : usernameSchema);
   } else if (command === "createsuperuser") {
      await createSuperuser();
   } else {
      usage();
      process.exitCode = command ? 1 : 0;
   }
} catch (error) {
   console.error(error instanceof Error ? error.message : "Command failed.");
   process.exitCode = 1;
}
