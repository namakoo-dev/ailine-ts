import fs from "node:fs";
import path from "node:path";

/**
 * load-refs (あ, CROSSING.md). Directory scan + filename sort + concatenation.
 *
 * Filename-ascending order is not cosmetic: it is what makes the assembled
 * prompt a pure function of the directory's contents, which is the floor the
 * LLM's own (already non-deterministic) output sits on (nodes/load-refs.md ②).
 *
 * The 「別タスク」 wording in the header is deliberate — it stops the model
 * from reading a few-shot example as the answer to the current task.
 *
 * Missing directory and empty directory are the same case: "" (no effect on
 * the prompt at all), so the caller never has to branch
 * (nodes/load-refs.md ③).
 */
export function loadRefs(refsDir: string): string {
  const files = listBas(refsDir);
  if (files.length === 0) {
    return "";
  }
  const chunks = files.map((f) => {
    const stem = path.basename(f, path.extname(f));
    return `--- 参考例: ${stem} ---\n${fs.readFileSync(f, "utf-8").trim()}`;
  });
  return "\n\nこれらは正しい書き方の参考（別タスク）:\n" + chunks.join("\n") + "\n--- 参考ここまで ---\n";
}

/** Shared by load-refs and load-helpers: `*.bas`, filename-ascending, absolute. */
export function listBas(dir: string): string[] {
  let entries: string[];
  try {
    if (!fs.statSync(dir).isDirectory()) {
      return [];
    }
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((n) => n.toLowerCase().endsWith(".bas"))
    .sort()
    .map((n) => path.join(dir, n));
}
