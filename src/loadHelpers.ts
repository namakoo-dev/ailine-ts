import fs from "node:fs";
import { helperCatalog } from "./contract.js";
import { listBas } from "./loadRefs.js";

export interface LoadedHelpers {
  /** Prompt text: warnings + usage examples + the full helper sources. */
  catalog: string;
  /** Real paths; basrun-apply-invocation copies these next to Gen.bas. */
  files: string[];
}

/**
 * load-helpers (あ, CROSSING.md).
 *
 * Structurally the same scan as load-refs, but the two differ in what the
 * output IS (nodes/load-helpers.md ①): refs are examples to imitate, helpers
 * are call targets that get shipped into the same Basic library at execution
 * time. That is why this one returns file paths as well as text, and why the
 * catalog carries a hard "don't copy the body, just Call it" prohibition.
 *
 * ★ Why this exists at all (nodes/load-helpers.md ②, internal session log,
 * 2026-08-10 04:49-05:29): few-shot alone lifted the weak tasks 0% -> 67%,
 * but 7B kept flipping SortByColumn's ContainsHeader. It picked the right API
 * and then lost a single boolean — a judgment slip, not a knowledge gap, and
 * comments warning about it did not help. The fix was to take the arcane
 * judgment out of the model's field of view entirely: a helper the human
 * verified once, and a model that only writes `Call SortByColumn(oDoc, 1,
 * False)`. It cannot slip on a decision it never touches.
 *
 * Missing/empty directory -> ("", []): ailine still runs, just with lower
 * odds on the arcane tasks (nodes/load-helpers.md ③).
 */
export function loadHelpers(helpersDir: string): LoadedHelpers {
  const files = listBas(helpersDir);
  if (files.length === 0) {
    return { catalog: "", files: [] };
  }
  // Full sources go into the prompt: Basic's `Call` requires the definition
  // to live in the same library, and showing it whole is the least
  // ambiguous way to say "this already exists" (nodes/load-helpers.md ③).
  const sources = files.map((f) => fs.readFileSync(f, "utf-8").trim()).join("\n");
  return { catalog: helperCatalog(sources), files };
}
