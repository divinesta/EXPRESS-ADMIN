---
layout: home

hero:
  name: Prisma Express Admin
  text: Register your models. The schema is the source of truth.
  tagline: A Django-style admin panel for Express and Prisma. You already wrote the data model — this library turns it into a guarded operations UI.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Wire it into your app
      link: /guide/in-your-app

features:
  - title: Schema-driven
    details: Reads your schema.prisma at mount. No second admin schema. register("User") is enough to get a working list and form.
  - title: Built-in or external auth
    details: Use the built-in admin-only login, sessions, and createsuperuser command, or plug in an existing session, JWT, or API key.
  - title: Scope is first-class
    details: A scope() function is applied to list, read, update, delete, relation picks, and custom actions. Ada cannot see Grace's tenant by guessing an ID.
  - title: Safe by default
    details: Password-like fields stay hidden. Unknown write keys are rejected. The schema endpoint sits behind the same auth as CRUD.
---
