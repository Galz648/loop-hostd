/**
 * Thin wrapper over the `herdr` CLI (talks to the local Herdr socket).
 * No JS SDK is published, so this shells out and parses stdout.
 */

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

async function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["herdr", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function runOrThrow(args: string[]): Promise<string> {
  const { stdout, stderr, exitCode } = await run(args);
  if (exitCode !== 0) {
    throw new Error(`herdr ${args.join(" ")} failed (${exitCode}): ${stderr || stdout}`);
  }
  return stdout.trim();
}

interface HerdrPane {
  pane_id: string;
  workspace_id: string;
}

/** Any existing pane to split new agent panes off of. There's always at least one — Herdr creates it with the session. */
async function pickBasePaneId(): Promise<string> {
  const out = await runOrThrow(["pane", "list"]);
  const parsed = JSON.parse(out) as { result: { panes: HerdrPane[] } };
  const pane = parsed.result.panes[0];
  if (!pane) throw new Error("no herdr panes available to split from");
  return pane.pane_id;
}

/** Split a new pane off an existing one, at an interactive shell prompt. */
export async function openPane(opts: { cwd?: string } = {}): Promise<string> {
  const basePaneId = await pickBasePaneId();
  const args = ["pane", "split", basePaneId, "--direction", "down"];
  if (opts.cwd) args.push("--cwd", opts.cwd);
  const out = await runOrThrow(args);
  const parsed = JSON.parse(out) as { result: { pane: HerdrPane } };
  const id = parsed.result.pane?.pane_id;
  if (!id) throw new Error(`herdr pane split returned no pane id: ${out}`);
  return id;
}

/** Start a supported interactive agent in an existing pane. */
export async function startAgent(opts: {
  name: string;
  kind: string;
  paneId: string;
  extraArgs?: string[];
}): Promise<void> {
  const args = ["agent", "start", opts.name, "--kind", opts.kind, "--pane", opts.paneId];
  if (opts.extraArgs?.length) args.push("--", ...opts.extraArgs);
  await runOrThrow(args);
}

/** Submit a prompt to an agent and optionally wait for it to settle. */
export async function promptAgent(opts: {
  target: string;
  text: string;
  wait?: boolean;
  until?: AgentStatus[];
  timeoutMs?: number;
}): Promise<void> {
  const args = ["agent", "prompt", opts.target, opts.text];
  if (opts.wait) args.push("--wait");
  for (const s of opts.until ?? []) args.push("--until", s);
  if (opts.timeoutMs) args.push("--timeout", String(opts.timeoutMs));
  await runOrThrow(args);
}

/** Block until an agent reaches one of the given states. */
export async function waitForAgent(opts: {
  target: string;
  until?: AgentStatus[];
  timeoutMs?: number;
}): Promise<void> {
  const args = ["agent", "wait", opts.target];
  for (const s of opts.until ?? []) args.push("--until", s);
  if (opts.timeoutMs) args.push("--timeout", String(opts.timeoutMs));
  await runOrThrow(args);
}

export async function getAgent(target: string): Promise<unknown> {
  const out = await runOrThrow(["agent", "get", target]);
  return out;
}

export async function isServerRunning(): Promise<boolean> {
  const { stdout, exitCode } = await run(["status"]);
  return exitCode === 0 && /status:\s*running/.test(stdout);
}
