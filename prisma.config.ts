import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://netchex:netchex_dev@localhost:5432/netchex_leads",
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
