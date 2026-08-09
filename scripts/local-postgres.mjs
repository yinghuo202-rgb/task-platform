import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = resolve("data/postgres-local");
const databaseName = "task_platform";
const postgres = new EmbeddedPostgres({
  databaseDir,
  port: 55432,
  user: "task_platform",
  password: "task_platform_local",
  persistent: true,
  onLog(message) {
    const text = String(message).trim();
    if (text) console.info(`[postgres] ${text}`);
  },
  onError(error) {
    console.error("[postgres]", error);
  },
});

if (!existsSync(resolve(databaseDir, "PG_VERSION"))) {
  console.info("正在初始化本地 PostgreSQL…");
  await postgres.initialise();
}

await postgres.start();

const client = postgres.getPgClient();
await client.connect();
const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
await client.end();
if (existing.rowCount === 0) await postgres.createDatabase(databaseName);

console.info("本地 PostgreSQL 已启动：127.0.0.1:55432/task_platform");
console.info("保持此进程运行；按 Ctrl+C 停止数据库。");

await new Promise(() => {});
