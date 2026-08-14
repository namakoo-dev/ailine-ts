import { CONTRACT } from "./contract.js";
import { describeBook } from "./describeBook.js";
import { loadHelpers } from "./loadHelpers.js";
import { loadRefs } from "./loadRefs.js";
import { ChatMessage } from "./ollama.js";

export interface AssembledPrompt {
  messages: ChatMessage[];
  /** basrun-apply-invocation ships these into the Basic library. */
  helperFiles: string[];
}

/**
 * prompt-assembly (あ, CROSSING.md). Fixed-order concatenation, nothing else.
 *
 *   system = CONTRACT + refs(few-shot) + helper catalog
 *   user   = describe_book + task + a restatement of the output format
 *
 * ★ CONTRACT is pinned first on purpose (nodes/prompt-assembly.md ②): it is
 * what the model must obey on every single call, and the two blocks after it
 * grow with the number of files on disk. Head position keeps the
 * highest-priority information from being the part that falls off when the
 * window fills.
 *
 * The document description sits in `user`, not `system`, because it is the
 * one part that changes per invocation — the fixed contract and the variable
 * subject stay separated (nodes/prompt-assembly.md ② marks this reading as
 * inference, not something the original stated).
 *
 * The closing restatement repeats, to the model, precisely what
 * valid-signature is about to check mechanically.
 */
export async function assemblePrompt(book: string, task: string, refsDir: string, helpersDir: string): Promise<AssembledPrompt> {
  const helpers = loadHelpers(helpersDir);
  const system = CONTRACT + loadRefs(refsDir) + helpers.catalog;
  const desc = await describeBook(book);
  const user = `${desc}\n\nタスク:\n${task}\n\n\`Sub Run(oDoc As Object)\` を1つだけ書け。コードのみ。`;
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    helperFiles: helpers.files,
  };
}
