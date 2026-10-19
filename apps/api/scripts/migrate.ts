import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://confeitaria_admin:confeitaria_admin@localhost:55432/confeitaria";
const migrationsDirectory = join(process.cwd(), "migrations");

async function main() {
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`
      create table if not exists app_migrations (
        version text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const source = await readFile(join(migrationsDirectory, file), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const applied = await sql<{ checksum: string }[]>`
        select checksum from app_migrations where version = ${file}
      `;

      if (applied[0]) {
        if (applied[0].checksum !== checksum) {
          throw new Error(`A migration aplicada ${file} foi alterada.`);
        }
        continue;
      }

      await sql.begin(async (transaction) => {
        await transaction.unsafe(source);
        await transaction`
          insert into app_migrations (version, checksum) values (${file}, ${checksum})
        `;
      });

      process.stdout.write(`Aplicada: ${file}\n`);
    }
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
