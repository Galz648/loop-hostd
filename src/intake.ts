import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/loop-hostd.config.ts";
import { getRunByIntakeFile, insertRun, updateRun } from "./db.ts";
import { openPane, promptAgent, startAgent, waitForAgent } from "./herdr.ts";

interface IntakeSpec {
  /** The prompt handed to the agent — a task, a skill invocation, whatever. */
  prompt: string;
  label?: string;
  kind?: string;
  /** Extra CLI args forwarded to the agent binary, e.g. ["--model", "haiku"]. */
  agentArgs?: string[];
}

function ensureDirs() {
  for (const d of [config.intakeDir, config.intakeProcessedDir, config.intakeFailedDir]) {
    mkdirSync(d, { recursive: true });
  }
}

function isIntakeFile(name: string): boolean {
  return (name.endsWith(".json")) && !name.startsWith(".");
}

async function processIntakeFile(fileName: string): Promise<void> {
  const filePath = join(config.intakeDir, fileName);

  if (getRunByIntakeFile(fileName)) {
    // Already tracked (e.g. left over from a previous run that crashed before archiving it).
    return;
  }

  let spec: IntakeSpec;
  try {
    spec = JSON.parse(await Bun.file(filePath).text());
    if (!spec.prompt) throw new Error("intake file missing required 'prompt' field");
  } catch (err) {
    console.error(`[intake] bad intake file ${fileName}:`, err);
    renameSync(filePath, join(config.intakeFailedDir, fileName));
    return;
  }

  const agentKind = spec.kind ?? config.defaultAgentKind;
  const run = insertRun({
    intake_file: fileName,
    prompt: spec.prompt,
    label: spec.label ?? null,
    agent_kind: agentKind,
  });

  console.log(`[intake] run ${run.id}: starting agent`);
  updateRun(fileName, { status: "starting" });

  try {
    const paneId = await openPane({ cwd: config.repoRoot });
    const agentName = `run-${run.id}`;
    await startAgent({ name: agentName, kind: agentKind, paneId, extraArgs: spec.agentArgs });
    updateRun(fileName, { pane_id: paneId, agent_name: agentName, status: "running" });

    await promptAgent({
      target: agentName,
      text: spec.prompt,
      wait: true,
      until: ["done", "blocked"],
    });

    // promptAgent already waited; confirm terminal state explicitly.
    await waitForAgent({ target: agentName, until: ["done", "blocked", "idle"], timeoutMs: 5000 }).catch(() => {});
    updateRun(fileName, { status: "done" });
    renameSync(filePath, join(config.intakeProcessedDir, fileName));
    console.log(`[intake] run ${run.id}: done`);
  } catch (err) {
    console.error(`[intake] run ${run.id}: failed`, err);
    updateRun(fileName, { status: "failed", error: String(err) });
    renameSync(filePath, join(config.intakeFailedDir, fileName));
  }
}

export function startIntakeWatcher(): () => void {
  ensureDirs();

  let stopped = false;
  let inFlight = new Set<string>();

  const tick = async () => {
    if (stopped) return;
    const entries = readdirSync(config.intakeDir).filter(isIntakeFile);
    for (const name of entries) {
      if (inFlight.has(name)) continue;
      inFlight.add(name);
      processIntakeFile(name)
        .catch((err) => console.error(`[intake] unhandled error for ${name}:`, err))
        .finally(() => inFlight.delete(name));
    }
  };

  const interval = setInterval(tick, config.intakePollIntervalMs);
  tick();

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
