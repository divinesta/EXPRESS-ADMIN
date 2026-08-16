---
layout: home

hero:
  name: Prisma Express Admin
  text: Register your models. The schema is the source of truth.
  tagline: A Django-style admin panel for Express and Prisma. You already wrote the data model — this library turns it into a guarded operations UI.
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: How it works
      link: /guide/how-it-works

features:
  - title: Schema-driven
    details: Reads your schema.prisma at mount. No second admin schema. register("User") is enough to get a working list and form.
  - title: You bring the identity
    details: There is no login page. Plug getCurrentUser into your session, JWT, or API key. The admin never invents users.
  - title: Scope is first-class
    details: A scope() function is applied to list, read, update, delete, relation picks, and custom actions. Ada cannot see Grace's tenant by guessing an ID.
  - title: Safe by default
    details: Password-like fields stay hidden. Unknown write keys are rejected. The schema endpoint sits behind the same auth as CRUD.
---
