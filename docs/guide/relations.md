# Relations

This release supports **reading** relations in lists and **writing a single `belongsTo` foreign key**. That is enough for “pick the author of this post.” It is not Django inlines.

## In the list

```ts
admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
});
```

`author` is a `belongsTo` User. The API selects `author.displayField` (usually `email` or `name`). The table shows that label, not a raw UUID.

`hasMany` / `manyToMany` names are not loaded as columns. Putting `"posts"` on `User`'s `listDisplay` will not embed an array of posts.

## On create and edit

The form renders a searchable select for each writable `belongsTo` (the scalar FK, e.g. `authorId`). Options come from the related model's list endpoint, so they run through **that** model's permissions and `scope`.

Ada creating a Post can only pick Northwind users. Grace cannot appear in Ada's author dropdown.

The select is not a nested create. You cannot spawn a User from the Post form.

## What the API accepts

```json
{ "title": "Quarterly review", "authorId": "example-user-ada", "published": false }
```

Not accepted:

```json
{ "author": { "connect": { "id": "…" } } }
{ "author": { "create": { "email": "…" } } }
{ "tags": { "set": [] } }
```

Those are Prisma write shapes. The admin rejects them as unknown or relation writes.

## Self-referential models

A `Category.parent` that points at `Category` uses the same select. Keep `scope` tight so the dropdown cannot wander.

## Not in this release

- Inline `hasMany` tables on the parent form
- Many-to-many chip editors
- Nested creates
- Ordering / disconnect semantics beyond setting the scalar FK

See [What is not included](/limits/not-included).
