import { defineConfig } from "vitepress";

export default defineConfig({
   title: "Prisma Express Admin",
   description: "A Django-style admin panel for Express and Prisma. Register your models. The schema is the source of truth.",
   srcExclude: ["MULTI_ORM_NOTES.md"],
   cleanUrls: true,
   lastUpdated: true,
   themeConfig: {
      logo: "/logo.svg",
      siteTitle: "Prisma Express Admin",
      nav: [
         { text: "Getting started", link: "/guide/getting-started" },
         { text: "Guide", link: "/guide/what-this-is" },
         { text: "Example", link: "/example/basic" },
         { text: "Reference", link: "/reference/create-admin" },
         { text: "npm", link: "https://www.npmjs.com/package/prisma-express-admin" },
      ],
      sidebar: [
         {
            text: "Start",
            items: [
               { text: "What this is", link: "/guide/what-this-is" },
               { text: "Getting started", link: "/guide/getting-started" },
               { text: "Wire it into your app", link: "/guide/in-your-app" },
               { text: "How it works", link: "/guide/how-it-works" },
            ],
         },
         {
            text: "Shape the admin",
            items: [
               { text: "Register a model", link: "/guide/register" },
               { text: "Lists, search, and filters", link: "/guide/lists" },
               { text: "Forms and field visibility", link: "/guide/forms" },
               { text: "Relations", link: "/guide/relations" },
            ],
         },
         {
            text: "Trust",
            items: [
               { text: "Authentication", link: "/guide/auth" },
               { text: "Permissions", link: "/guide/permissions" },
               { text: "Multi-tenant scope", link: "/guide/scope" },
               { text: "Sensitive fields", link: "/guide/sensitive-fields" },
            ],
         },
         {
            text: "Extend",
            items: [
               { text: "Lifecycle hooks", link: "/guide/hooks" },
               { text: "Custom actions", link: "/guide/actions" },
               { text: "Audit log", link: "/guide/audit" },
            ],
         },
         {
            text: "Example",
            items: [{ text: "Northwind and Contoso", link: "/example/basic" }],
         },
         {
            text: "Reference",
            items: [
               { text: "createAdmin()", link: "/reference/create-admin" },
               { text: "register()", link: "/reference/register" },
               { text: "AdminUser", link: "/reference/admin-user" },
               { text: "HTTP API", link: "/reference/http-api" },
               { text: "Errors", link: "/reference/errors" },
            ],
         },
         {
            text: "Limits",
            items: [
               { text: "What is not included", link: "/limits/not-included" },
               { text: "Prisma versions", link: "/limits/prisma" },
            ],
         },
      ],
      socialLinks: [{ icon: "github", link: "https://github.com/divinesta/EXPRESS-ADMIN" }],
      search: { provider: "local" },
      editLink: {
         pattern: "https://github.com/divinesta/EXPRESS-ADMIN/edit/main/docs/:path",
         text: "Edit this page",
      },
      outline: { level: [2, 3] },
      footer: {
         message: "Released under the MIT License.",
         copyright: "Prisma Express Admin",
      },
   },
});
