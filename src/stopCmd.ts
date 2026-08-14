import { run } from "./basrunApply.js";
import { basrunPath } from "./basrunPath.js";

/**
 * cmd-stop (あ, CROSSING.md). A thin delegation to basrun's own stop.
 *
 * basrun already settled the hard parts — never touching the user's real
 * LibreOffice profile, idempotence, waiting until the instance is actually
 * gone — under rules that were hardened by real damage. Reimplementing any of
 * that here would be reinventing a wheel that is already round
 * (nodes/cmd-stop.md ②).
 *
 * ★ Always returns 0, even when the delegate fails. That is asymmetric with
 * `run`, which propagates basrun's failure strictly, and
 * nodes/cmd-stop.md ③ flags it as a known asymmetry rather than a bug — so it
 * is carried deliberately, not quietly fixed. `stop` is a cleanup verb; a
 * nonzero exit from "there was nothing to stop" would be noise in scripts
 * that call it in a finally block.
 */
export async function cmdStop(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cli = basrunPath(env);
  const { out } = await run(process.execPath, [cli, "stop"], env);
  if (out.trim()) {
    process.stdout.write(out.trim() + "\n");
  }
  return 0;
}
