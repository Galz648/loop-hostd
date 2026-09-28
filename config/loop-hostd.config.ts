import { resolve } from "node:path";

const dataDir = resolve(process.env.LOOP_HOSTD_DATA_DIR ?? ".data");

export const config = {
  dataDir,
  dbPath: resolve(dataDir, "db", "loop-hostd.sqlite"),
  intakeDir: resolve(dataDir, "intake"),
  intakeProcessedDir: resolve(dataDir, "intake", "processed"),
  intakeFailedDir: resolve(dataDir, "intake", "failed"),
  /** Repo checkout the loop operates on. Defaults to cwd — the only env assumption per the portability rule. */
  repoRoot: resolve(process.env.LOOP_HOSTD_REPO_ROOT ?? process.cwd()),
  herdrSocketPath:
    process.env.HERDR_CONFIG_PATH ?? resolve(process.env.HOME ?? "", ".config/herdr/herdr.sock"),
  defaultAgentKind: process.env.LOOP_HOSTD_AGENT_KIND ?? "claude",
  intakePollIntervalMs: Number(process.env.LOOP_HOSTD_POLL_MS ?? 2000),
};

export type LoopHostdConfig = typeof config;
