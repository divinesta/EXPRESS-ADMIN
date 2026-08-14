import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the basic example.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const ada = await prisma.user.upsert({
  where: { email: "ada@example.test" },
  update: { fullName: "Ada Lovelace", role: "ADMIN", isActive: true },
  create: { id: "example-user-ada", email: "ada@example.test", fullName: "Ada Lovelace", role: "ADMIN" },
});

const grace = await prisma.user.upsert({
  where: { email: "grace@example.test" },
  update: { fullName: "Grace Hopper", role: "USER", isActive: true },
  create: { id: "example-user-grace", email: "grace@example.test", fullName: "Grace Hopper" },
});

await prisma.post.upsert({
  where: { id: "example-post-welcome" },
  update: { title: "Welcome to Prisma Express Admin", content: "This published post is seeded for the basic example.", published: true, authorId: ada.id },
  create: { id: "example-post-welcome", title: "Welcome to Prisma Express Admin", content: "This published post is seeded for the basic example.", published: true, authorId: ada.id },
});

await prisma.post.upsert({
  where: { id: "example-post-draft" },
  update: { title: "A draft for review", content: "Use this record to try editing fields in the admin.", published: false, authorId: grace.id },
  create: { id: "example-post-draft", title: "A draft for review", content: "Use this record to try editing fields in the admin.", published: false, authorId: grace.id },
});

await prisma.$disconnect();

console.log("Seeded the basic example with 2 users and 2 posts.");
