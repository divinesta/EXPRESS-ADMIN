# express-admin

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Run the local admin UI

Start PostgreSQL and make sure the schema exists:

```bash
docker compose up -d postgres
bun run db:push
```

Then start the development host:

```bash
bun run dev
```

Open [http://localhost:3000/admin](http://localhost:3000/admin). The root development host uses a local super-admin identity so the UI can be exercised without wiring an application login system yet. Replace that adapter before deploying.

## API documentation

The current scalar CRUD API, error responses, supported list queries, and real PostgreSQL integration-test setup are documented in [docs/api.md](docs/api.md).
