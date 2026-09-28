import { config } from "../config/loop-hostd.config.ts";
import { openDb } from "./db.ts";
import { isServerRunning } from "./herdr.ts";
import { startIntakeWatcher } from "./intake.ts";

async function main() {
  if (!(await isServerRunning())) {
    console.error(
      "[loop-hostd] herdr server is not running. Start a persistent session first: `herdr --session loop-hostd`.",
    );
    process.exit(1);
  }

  openDb();
  console.log(`[loop-hostd] db ready at ${config.dbPath}`);
  console.log(`[loop-hostd] watching intake dir: ${config.intakeDir}`);

  const stopWatcher = startIntakeWatcher();

  const shutdown = () => {
    console.log("[loop-hostd] shutting down");
    stopWatcher();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
