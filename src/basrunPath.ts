import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AilineError } from "./errors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Package root: `src/` in dev, `dist/` after build — parent either way. */
const PKG_ROOT = path.resolve(HERE, "..");

/**
 * basrun-path-resolution (あ, CROSSING.md). Env var, then siblings, then a
 * clone-instructions exit.
 *
 * The shape is carried; the names are adapted, because what this port depends
 * on is basrun-TS, not basrun.py. The original looked for `basrun.py` under
 * sibling `basrun/` or `nagi-bas/`; here the sibling candidates are the
 * built CLI entry points, and the env var is BASRUN_TS.
 *
 * ★ The env var's value is deliberately NOT existence-checked, exactly as in
 * the original (nodes/basrun-path-resolution.md ②): basrun only fails
 * meaningfully when it actually tries to drive LibreOffice, so a pre-flight
 * check here would only produce a second, less informative error message
 * ahead of the real one. The subprocess call in basrun-apply-invocation is
 * where a wrong path surfaces, loudly.
 *
 * Sibling order is significant — the first hit wins
 * (nodes/basrun-path-resolution.md ③).
 */
export const SIBLING_CANDIDATES = ["../basrun-ts/dist/cli.js", "../basrun/dist/cli.js"];

export function basrunPath(env: NodeJS.ProcessEnv = process.env, pkgRoot: string = PKG_ROOT): string {
  const fromEnv = env.BASRUN_TS;
  if (fromEnv && fromEnv !== "") {
    return fromEnv;
  }
  for (const rel of SIBLING_CANDIDATES) {
    const p = path.resolve(pkgRoot, rel);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  // The original's message is not in the B棚 verbatim beyond "clone 手順込み";
  // ③ also records that it did NOT list the paths it searched, and calls that
  // a known asymmetry worth improving on. So: list them.
  const searched = SIBLING_CANDIDATES.map((rel) => `  - ${path.resolve(pkgRoot, rel)}`).join("\n");
  throw new AilineError(
    "basrun-ts が見つからない。ailine-ts は basrun-ts を同梱せず、隣に置かれている前提で呼ぶ。\n" +
      `探した場所:\n${searched}\n` +
      "対処のどちらか:\n" +
      "  1. 隣に clone してビルドする:\n" +
      `       git clone <basrun-ts> ${path.resolve(pkgRoot, "../basrun-ts")}\n` +
      "       cd ../basrun-ts && npm install && npm run build\n" +
      "  2. 環境変数で直接指す: BASRUN_TS=<...>/basrun-ts/dist/cli.js",
  );
}
