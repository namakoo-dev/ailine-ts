/**
 * extract-bas (あ, CROSSING.md). One regex.
 *
 * Python original: re.search(r"```(?:\w+)?\s*(.*?)```", text, re.S).
 * JS has no re.S/DOTALL flag, so `.` is replaced by `[\s\S]` — the standard
 * equivalent. Everything else transfers literally:
 *   - `(?:\w+)?` optional, non-capturing language tag (```basic / ```)
 *   - `[\s\S]*?` non-greedy, so only the FIRST fence block is taken and a
 *     second block later in the reply is never concatenated onto it
 *     (nodes/extract-bas.md ③)
 *   - no fence at all -> the whole text passes through
 * `.trim()` in both branches, matching the original's single trailing .strip().
 */
const FENCE = /```(?:\w+)?\s*([\s\S]*?)```/;

export function extractBas(text: string): string {
  const m = FENCE.exec(text);
  return (m?.[1] ?? text).trim();
}
