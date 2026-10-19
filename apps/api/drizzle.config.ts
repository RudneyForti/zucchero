import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      "postgres://confeitaria_admin:confeitaria_admin@localhost:55432/confeitaria",
  },
  strict: true,
  verbose: true,
});
