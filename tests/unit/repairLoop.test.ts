import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The largest hole in the Python suite: the repair loop was never exercised
 * end to end (GOLDEN.md F, and nodes/repair-loop.md's own GOLDEN section says
 * so outright — "このループ自体を通しで検証する自動テストは無い").
 *
 * The apply half genuinely needs LibreOffice and lives in tests/e. The
 * signature-repair half does not: with the LLM mocked and --dry set, the
 * whole loop up to the apply step runs offline. That covers attempt counting,
 * conversation accumulation, and the --dry branch point.
 */
const generate = vi.hoisted(() => vi.fn());
vi.mock("../../src/ollama.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/ollama.js")>();
  return { ...actual, ollamaGenerate: generate };
});

const { repairLoop, REPAIR_BAD_SIGNATURE } = await import("../../src/repairLoop.js");
const { makeBook, tmpDir, PKG_ROOT } = await import("./_book.js");

const GOOD = "Option VBASupport 1\nOption Explicit\nSub Run(oDoc As Object)\nEnd Sub";
const BAD = "Option Explicit\nSub Nope()\nEnd Sub";

let book: string;

beforeEach(async () => {
  generate.mockReset();
  book = await makeBook(path.join(tmpDir(), "b.xlsx"));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function args(over: Partial<Parameters<typeof repairLoop>[0]> = {}) {
  return {
    book,
    task: "見出しを太字に",
    model: "test-model",
    refs: path.join(PKG_ROOT, "refs"),
    helpers: path.join(PKG_ROOT, "helpers"),
    repair: 2,
    temperature: 0.2,
    dry: true,
    inplace: false,
    json: false,
    ...over,
  };
}

describe("repair-loop (LLM mocked, --dry so LibreOffice is never touched)", () => {
  it("succeeds on the first attempt when the signature is valid", async () => {
    generate.mockResolvedValue(`\`\`\`basic\n${GOOD}\n\`\`\``);
    const { code, result } = await repairLoop(args());
    expect(code).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("a bad signature triggers repair message A and a retry", async () => {
    generate.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    const { code, result } = await repairLoop(args());
    expect(code).toBe(0);
    expect(result.attempts).toBe(2);

    // The history accumulates assistant/user pairs — the model is shown its
    // own previous output, never asked from scratch
    // (nodes/repair-loop.md ③).
    const second = generate.mock.calls[1]?.[1] as { role: string; content: string }[];
    expect(second).toHaveLength(4);
    expect(second[0]?.role).toBe("system");
    expect(second[1]?.role).toBe("user");
    expect(second[2]).toEqual({ role: "assistant", content: BAD });
    expect(second[3]).toEqual({ role: "user", content: REPAIR_BAD_SIGNATURE });
  });

  it("exhausting --repair returns a nonzero exit code", async () => {
    generate.mockResolvedValue(BAD);
    const { code, result } = await repairLoop(args());
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3); // --repair 2 == 3 attempts
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("--repair 0 means exactly one attempt", async () => {
    generate.mockResolvedValue(BAD);
    const { code } = await repairLoop(args({ repair: 0 }));
    expect(code).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("an empty LLM response fails the signature check and is repaired, not crashed on", async () => {
    generate.mockResolvedValueOnce("").mockResolvedValueOnce(GOOD);
    const { code, result } = await repairLoop(args());
    expect(code).toBe(0);
    expect(result.attempts).toBe(2);
  });

  it("the assembled prompt carries CONTRACT, few-shot and the helper catalog", async () => {
    generate.mockResolvedValue(GOOD);
    await repairLoop(args());
    const msgs = generate.mock.calls[0]?.[1] as { role: string; content: string }[];
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("Option VBASupport 1"); // CONTRACT, point 1
    expect(system).toContain("参考例:"); // load-refs
    expect(system).toContain("SortByColumn"); // load-helpers catalog
    expect(system.indexOf("Sub Run(oDoc As Object)")).toBeGreaterThan(-1);
    // CONTRACT must come first, ahead of the two blocks that grow with the
    // number of files on disk (nodes/prompt-assembly.md ②).
    expect(system.indexOf("あなたは LibreOffice Calc")).toBe(0);

    const user = msgs[1]?.content ?? "";
    expect(user).toContain("列0=商品"); // describe-book
    expect(user).toContain("見出しを太字に"); // the task, verbatim
    expect(user).toContain("`Sub Run(oDoc As Object)` を1つだけ書け。コードのみ。");
  });

  it("--dry never writes the .out copy", async () => {
    generate.mockResolvedValue(GOOD);
    await repairLoop(args());
    const { existsSync } = await import("node:fs");
    expect(existsSync(book.replace(/\.xlsx$/, ".out.xlsx"))).toBe(false);
  });
});
