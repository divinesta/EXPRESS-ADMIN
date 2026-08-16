import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the basic example.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const northwind = await prisma.tenant.upsert({
  where: { id: "example-tenant-northwind" },
  update: { name: "Northwind" },
  create: { id: "example-tenant-northwind", name: "Northwind" },
});

const contoso = await prisma.tenant.upsert({
  where: { id: "example-tenant-contoso" },
  update: { name: "Contoso" },
  create: { id: "example-tenant-contoso", name: "Contoso" },
});

const ada = await prisma.user.upsert({
  where: { email: "ada@example.test" },
  update: { fullName: "Ada Lovelace", role: "ADMIN", isActive: true, tenantId: northwind.id },
  create: { id: "example-user-ada", email: "ada@example.test", fullName: "Ada Lovelace", role: "ADMIN", tenantId: northwind.id },
});

const grace = await prisma.user.upsert({
  where: { email: "grace@example.test" },
  update: { fullName: "Grace Hopper", role: "ADMIN", isActive: true, tenantId: contoso.id },
  create: { id: "example-user-grace", email: "grace@example.test", fullName: "Grace Hopper", role: "ADMIN", tenantId: contoso.id },
});

const linus = await prisma.user.upsert({
  where: { email: "linus@example.test" },
  update: { fullName: "Linus Torvalds", role: "SUPER_ADMIN", isActive: true, tenantId: northwind.id },
  create: { id: "example-user-linus", email: "linus@example.test", fullName: "Linus Torvalds", role: "SUPER_ADMIN", tenantId: northwind.id },
});

await prisma.post.upsert({
  where: { id: "example-post-welcome" },
  update: { title: "Welcome to Prisma Express Admin", content: "This published post is seeded for the basic example.", published: true, authorId: ada.id, tenantId: northwind.id },
  create: { id: "example-post-welcome", title: "Welcome to Prisma Express Admin", content: "This published post is seeded for the basic example.", published: true, authorId: ada.id, tenantId: northwind.id },
});

await prisma.post.upsert({
  where: { id: "example-post-draft" },
  update: { title: "A draft for review", content: "This Contoso draft should not be visible to Ada.", published: false, authorId: grace.id, tenantId: contoso.id },
  create: { id: "example-post-draft", title: "A draft for review", content: "This Contoso draft should not be visible to Ada.", published: false, authorId: grace.id, tenantId: contoso.id },
});

await prisma.$disconnect();

console.log(`Seeded the basic example with ${[ada, grace, linus].length} users, 2 tenants, and 2 posts.`);
