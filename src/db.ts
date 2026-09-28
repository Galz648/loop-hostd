import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config/loop-hostd.config.ts";

export type RunStatus = "queued" | "starting" | "running" | "done" | "blocked" | "failed";

export interface RunRow {
  id: number;
  intake_file: string;
  prompt: string;
  label: string | null;
  agent_kind: string;
  agent_name: string | null;
  pane_id: string | null;
  status: RunStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

let db: Database | undefined;

export function openDb(): Database {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA busy_timeout = 30000;");
  db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_file TEXT NOT NULL UNIQUE,
      prompt TEXT NOT NULL,
      label TEXT,
      agent_kind TEXT NOT NULL,
      agent_name TEXT,
      pane_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export function insertRun(row: {
  intake_file: string;
  prompt: string;
  label: string | null;
  agent_kind: string;
}): RunRow {
  const conn = openDb();
  conn
    .query(
      `INSERT INTO runs (intake_file, prompt, label, agent_kind) VALUES (?, ?, ?, ?)`,
    )
    .run(row.intake_file, row.prompt, row.label, row.agent_kind);
  return conn
    .query(`SELECT * FROM runs WHERE intake_file = ?`)
    .get(row.intake_file) as RunRow;
}

export function updateRun(
  intakeFile: string,
  patch: Partial<Pick<RunRow, "status" | "agent_name" | "pane_id" | "error">>,
): void {
  const conn = openDb();
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => (patch as Record<string, unknown>)[f]) as (string | null)[];
  conn
    .query(`UPDATE runs SET ${setClause}, updated_at = datetime('now') WHERE intake_file = ?`)
    .run(...values, intakeFile);
}

export function getRunByIntakeFile(intakeFile: string): RunRow | null {
  const conn = openDb();
  return (conn.query(`SELECT * FROM runs WHERE intake_file = ?`).get(intakeFile) as RunRow) ?? null;
}

export function listActiveRuns(): RunRow[] {
  const conn = openDb();
  return conn
    .query(`SELECT * FROM runs WHERE status IN ('starting', 'running') `)
    .all() as RunRow[];
}
