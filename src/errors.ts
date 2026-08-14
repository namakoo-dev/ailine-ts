/**
 * Error taxonomy.
 *
 * The distinction that matters is the one nodes/ollama-generate.md ③ draws:
 * a connection failure to the LLM is NOT a retryable failure and must never
 * enter the repair loop ("接続断はリトライしても直らない"). That is encoded
 * as a type here rather than as a convention, so repair-loop cannot
 * accidentally swallow it.
 */
export class AilineError extends Error {
  readonly exitCode: number = 1;
}

/** Usage / argument errors. Exit code 2, matching argparse (nodes/cli-overview.md ③). */
export class AilineUsageError extends AilineError {
  override readonly exitCode = 2;
}

/**
 * Unrecoverable: kills the process immediately, bypassing the repair loop.
 * Used for ollama connection failure (nodes/ollama-generate.md ③).
 */
export class AilineFatalError extends AilineError {}
