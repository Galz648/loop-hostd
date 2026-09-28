import { Stack, localState } from "alchemy";
import * as Command from "alchemy/Command";
import * as Effect from "effect/Effect";

export default Stack(
  "loop-hostd",
  {
    providers: Command.providers(),
    state: localState(),
  },
  Effect.gen(function* () {
    yield* Command.Exec("state-dirs", {
      command: "mkdir -p .data/db .data/intake/processed .data/intake/failed",
    });

    // Herdr gives persistent PTY sessions; the runner needs an existing pane
    // to split agent panes off of, so fail fast if no server/session is up
    // rather than the runner discovering it mid-intake-processing.
    yield* Command.Exec("herdr-server-check", {
      command: "herdr status | grep -q 'status: running'",
      shell: true,
      memo: false,
    });

    const runner = yield* Command.Dev("runner", {
      command: "bun run src/main.ts",
    });

    return { runner: runner.url };
  }),
);
