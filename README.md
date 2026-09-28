# loop-hostd

Hosts agents on top of [Herdr](https://herdr.dev) persistent PTY sessions,
driven by dropping intake files with a prompt/skill to run. Stage 1: local
only. See `Spec 1 — Hosting (Local, then Remote)` for the full plan. (A
Looper-style designed loop can be a `prompt` later — nothing here assumes
that shape.)

## How it works

- `alchemy.run.ts` is the infra program (Alchemy v2): it ensures the local
  data dirs exist and a Herdr server is reachable, then supervises the
  runner as a `Command.Dev` process (restarts on code change, survives while
  `alchemy dev` is up).
- `src/main.ts` is the runner: it watches `.data/intake/` for JSON intake
  files, and for each one opens a Herdr pane, starts an agent in it, and
  sends it the given prompt.
- `src/db.ts` tracks run state (queued → starting → running → done/blocked/failed)
  in SQLite at `.data/db/loop-hostd.sqlite`.
- `src/herdr.ts` shells out to the `herdr` CLI (pane/agent control) since
  there's no published JS SDK. Agent panes are split off whatever pane Herdr
  already has open — no dedicated session needed, any running Herdr server
  works.

## Usage

```sh
bun install

# one-time: make sure Herdr's server is up
herdr status

# run via Alchemy (recommended — manages the session + dirs for you)
bun run alchemy:dev

# or run the watcher directly (assumes a herdr session is already running)
bun run dev
```

Drop an intake file to kick off a run:

```sh
cp examples/intake/example.json .data/intake/my-run.json
```

Intake file shape:

```json
{
  "prompt": "task or /skill-name for the agent to run",
  "label": "optional human label",
  "kind": "claude",
  "agentArgs": ["--model", "haiku"]
}
```

Processed files move to `.data/intake/processed/`; failed ones to
`.data/intake/failed/` with the error recorded on the `runs` row.

### First run in a new repo checkout

Claude Code shows a one-time "do you trust this folder?" dialog the first
time it's launched in a given directory. That dialog blocks Herdr's
readiness check (`agent_not_ready`), so the first intake run against a fresh
`repoRoot` will fail. Run `claude` there once yourself and accept the trust
prompt — after that it's remembered and headless runs work.

## Portability

The runner's only environment assumptions are a repo checkout (`repoRoot`)
and a Herdr socket — both are config (`config/loop-hostd.config.ts`), not
hardcoded. Stage 2 (Cloudflare Containers via Alchemy) swaps the target the
same resources deploy to, not the resource definitions themselves.
