import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrderStatus, ProductStatus, Role } from "./generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the basic example.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const tenants = [
   { id: "example-tenant-northwind", name: "Northwind" },
   { id: "example-tenant-contoso", name: "Contoso" },
   { id: "example-tenant-fabrikam", name: "Fabrikam" },
] as const;
const names = ["Ada Lovelace", "Grace Hopper", "Linus Torvalds", "Margaret Hamilton", "Katherine Johnson", "Alan Turing", "Dorothy Vaughan", "Edsger Dijkstra", "Radia Perlman", "Annie Easley", "Donald Knuth", "Mary Jackson", "Barbara Liskov", "Hedy Lamarr", "Ken Thompson", "Frances Allen", "James Gosling", "Sophie Wilson", "Guido van Rossum", "Shafi Goldwasser", "Tim Berners-Lee", "Joan Clarke", "Fei-Fei Li", "Yukihiro Matsumoto"];
const customerNames = ["Maya Okafor", "Ibrahim Bello", "Zainab Musa", "David Chen", "Sofia Alvarez", "Amara Diallo", "Noah Williams", "Chioma Eze", "Tariq Rahman", "Hannah Kim", "Luca Rossi", "Amina Yusuf", "Olivia Martin", "Samira Patel", "Kofi Mensah", "Ella Johnson", "Mateo Silva", "Nneka Obi", "Daniel Park", "Fatima Sule"];
const categoryNames = ["Analytics", "Automation", "Collaboration", "Developer tools", "Finance", "Hardware", "Marketing", "Operations", "Security", "Support", "Training", "Workspace"];
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const dateFor = (index: number) => new Date(Date.UTC(2026, index % 8, (index % 27) + 1, 9 + (index % 7), (index * 11) % 60));

try {
   const tenantIds = tenants.map((tenant) => tenant.id);
   await prisma.orderItem.deleteMany({ where: { order: { tenantId: { in: tenantIds } } } });
   await prisma.order.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.post.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.category.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
   await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
   await prisma.tenant.createMany({ data: tenants });

   const users = tenants.flatMap((tenant, tenantIndex) => names.map((fullName, index) => {
      const fixedEmail = tenant.name === "Northwind" && index === 0 ? "ada@example.test" : tenant.name === "Contoso" && index === 1 ? "grace@example.test" : tenant.name === "Northwind" && index === 2 ? "linus@example.test" : null;
      const role = tenant.name === "Northwind" && index === 2 ? Role.SUPER_ADMIN : index === 0 || (tenantIndex === 2 && index === 3) ? Role.ADMIN : Role.USER;
      return { id: `example-user-${tenantIndex + 1}-${index + 1}`, email: fixedEmail ?? `${slug(fullName)}.${slug(tenant.name)}@example.test`, fullName, role, isActive: index % 11 !== 0, tenantId: tenant.id, createdAt: dateFor(index + tenantIndex * names.length) };
   }));
   await prisma.user.createMany({ data: users });

   const customers = tenants.flatMap((tenant, tenantIndex) => customerNames.map((fullName, index) => ({
      id: `example-customer-${tenantIndex + 1}-${index + 1}`, email: `${slug(fullName)}.${slug(tenant.name)}.customer@example.test`, fullName,
      company: index % 3 === 0 ? `${fullName.split(" ")[0]} & Co.` : null, isActive: index % 9 !== 0, tenantId: tenant.id, createdAt: dateFor(index + 80 + tenantIndex * customerNames.length),
   })));
   await prisma.customer.createMany({ data: customers });

   const categories = tenants.flatMap((tenant, tenantIndex) => categoryNames.map((name, index) => ({ id: `example-category-${tenantIndex + 1}-${index + 1}`, name, description: `${name} catalog for ${tenant.name}.`, tenantId: tenant.id })));
   await prisma.category.createMany({ data: categories });

   const products = tenants.flatMap((tenant, tenantIndex) => Array.from({ length: 40 }, (_, index) => {
      const category = categories[tenantIndex * categoryNames.length + (index % categoryNames.length)];
      return {
         id: `example-product-${tenantIndex + 1}-${index + 1}`, sku: `${tenant.name.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`,
         name: `${category.name} ${["Starter", "Standard", "Professional", "Team", "Enterprise"][index % 5]} ${Math.floor(index / 5) + 1}`,
         description: `Sample ${category.name.toLowerCase()} product ${index + 1} for realistic list, search, and filter testing.`, price: Number((19 + index * 7.35 + tenantIndex * 3).toFixed(2)), stock: (index * 13 + tenantIndex * 17) % 180,
         status: index % 13 === 0 ? ProductStatus.ARCHIVED : index % 5 === 0 ? ProductStatus.DRAFT : ProductStatus.ACTIVE, categoryId: category.id, tenantId: tenant.id, createdAt: dateFor(index + 200 + tenantIndex * 40),
      };
   }));
   await prisma.product.createMany({ data: products });

   const posts = tenants.flatMap((tenant, tenantIndex) => Array.from({ length: 40 }, (_, index) => ({
      id: `example-post-${tenantIndex + 1}-${index + 1}`, title: `${["Quarterly update", "Customer story", "Product note", "Release plan", "Team memo"][index % 5]} ${index + 1}`,
      content: `This is seeded post ${index + 1} for ${tenant.name}. It provides varied data for search, drafts, publications, and date filters.`, published: index % 4 !== 0,
      authorId: users[tenantIndex * names.length + (index % names.length)].id, tenantId: tenant.id, createdAt: dateFor(index + 400 + tenantIndex * 40),
   })));
   await prisma.post.createMany({ data: posts });

   let orderCount = 0;
   let itemCount = 0;
   for (const [tenantIndex, tenant] of tenants.entries()) {
      const tenantCustomers = customers.slice(tenantIndex * customerNames.length, (tenantIndex + 1) * customerNames.length);
      const tenantUsers = users.slice(tenantIndex * names.length, (tenantIndex + 1) * names.length);
      const tenantProducts = products.slice(tenantIndex * 40, (tenantIndex + 1) * 40);
      for (let index = 0; index < 30; index += 1) {
         const chosenProducts = Array.from({ length: 2 + (index % 3) }, (_, itemIndex) => tenantProducts[(index * 3 + itemIndex * 7) % tenantProducts.length]);
         const itemData = chosenProducts.map((product, itemIndex) => ({ productId: product.id, quantity: 1 + ((index + itemIndex) % 4), unitPrice: product.price }));
         const total = itemData.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
         await prisma.order.create({ data: {
            id: `example-order-${tenantIndex + 1}-${index + 1}`, reference: `${tenant.name.slice(0, 3).toUpperCase()}-2026-${String(index + 1).padStart(4, "0")}`,
            status: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.FULFILLED, OrderStatus.CANCELLED, OrderStatus.REFUNDED][index % 5], total: Number(total.toFixed(2)),
            customerId: tenantCustomers[index % tenantCustomers.length].id, ownerId: tenantUsers[index % 4].id, tenantId: tenant.id, placedAt: dateFor(index + 520 + tenantIndex * 30), items: { create: itemData },
         }});
         orderCount += 1;
         itemCount += itemData.length;
      }
   }
   console.log(`Seeded ${tenants.length} tenants, ${users.length} users, ${customers.length} customers, ${categories.length} categories, ${products.length} products, ${posts.length} posts, ${orderCount} orders, and ${itemCount} order items.`);
} finally {
   await prisma.$disconnect();
}
