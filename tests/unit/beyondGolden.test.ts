import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIBLING_CANDIDATES, basrunPath } from "../../src/basrunPath.js";
import { parseArgv } from "../../src/cli.js";
import { AilineError, AilineFatalError, AilineUsageError } from "../../src/errors.js";
import { ollamaGenerate, ollamaHost } from "../../src/ollama.js";
import { outPath } from "../../src/repairLoop.js";
import { chartsCount } from "../../src/zipEntries.js";
import { PKG_ROOT, tmpDir } from "./_book.js";

/**
 * Beyond GOLDEN — the units the Python suite never covered.
 *
 * GOLDEN.md F lists them by name (cli-overview's argparse checking,
 * basrun-path-resolution, ollama-generate, cmd-stop, the repair loop end to
 * end) and calls them "TS 版が超える好機" rather than a spec to match. None of
 * these assert against a recorded Python behavior — they pin the behavior the
 * node docs describe.
 */

describe("cli-overview — argument parsing (no ollama, no LibreOffice)", () => {
  it("run: positional book/task plus every documented default", () => {
    const p = parseArgv(["run", "b.xlsx", "金額で降順に並べ替え"], {});
    expect(p.command).toBe("run");
    if (p.command !== "run") return;
    expect(p.args.book).toBe("b.xlsx");
    expect(p.args.task).toBe("金額で降順に並べ替え");
    expect(p.args.model).toBe("qwen2.5-coder:7b");
    expect(p.args.refs).toBe("./refs");
    expect(p.args.helpers).toBe("./helpers");
    expect(p.args.repair).toBe(2);
    expect(p.args.temperature).toBe(0.2);
    expect(p.args.dry).toBe(false);
    expect(p.args.inplace).toBe(false);
    expect(p.args.json).toBe(false);
  });

  it("run: AILINE_MODEL overrides the built-in default", () => {
    const p = parseArgv(["run", "b.xlsx", "t"], { AILINE_MODEL: "qwen3:8b" });
    expect(p.command === "run" && p.args.model).toBe("qwen3:8b");
  });

  it("run: --model overrides AILINE_MODEL", () => {
    const p = parseArgv(["run", "b.xlsx", "t", "--model", "llama3:latest"], { AILINE_MODEL: "qwen3:8b" });
    expect(p.command === "run" && p.args.model).toBe("llama3:latest");
  });

  it("run: numeric options are parsed, not left as strings", () => {
    const p = parseArgv(["run", "b.xlsx", "t", "--repair", "0", "--temperature", "0.9", "--dry", "--json"], {});
    if (p.command !== "run") throw new Error("expected run");
    expect(p.args.repair).toBe(0);
    expect(p.args.temperature).toBe(0.9);
    expect(p.args.dry).toBe(true);
    expect(p.args.json).toBe(true);
  });

  it("stop: takes no arguments", () => {
    expect(parseArgv(["stop"], {}).command).toBe("stop");
  });

  it("a missing subcommand exits 2, like argparse", () => {
    try {
      parseArgv([], {});
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AilineUsageError);
      expect((err as AilineUsageError).exitCode).toBe(2);
    }
  });

  it("an unknown subcommand exits 2", () => {
    expect(() => parseArgv(["frobnicate"], {})).toThrow(AilineUsageError);
  });

  it("a missing positional argument exits 2", () => {
    expect(() => parseArgv(["run", "only-the-book.xlsx"], {})).toThrow(AilineUsageError);
  });
});

describe("basrun-path-resolution", () => {
  it("BASRUN_TS wins and is deliberately NOT existence-checked", () => {
    // nodes/basrun-path-resolution.md ②: a pre-flight check here would only
    // produce a second, worse error ahead of the real one.
    const bogus = "C:/definitely/not/here/cli.js";
    expect(basrunPath({ BASRUN_TS: bogus })).toBe(bogus);
  });

  it("falls back to the sibling directory when no env var is set", () => {
    const root = tmpDir();
    const pkg = path.join(root, "ailine-ts");
    const sibling = path.join(root, "basrun-ts", "dist");
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, "cli.js"), "");
    expect(basrunPath({}, pkg)).toBe(path.resolve(sibling, "cli.js"));
  });

  it("prefers the first candidate when several exist", () => {
    const root = tmpDir();
    const pkg = path.join(root, "ailine-ts");
    fs.mkdirSync(pkg, { recursive: true });
    for (const rel of SIBLING_CANDIDATES) {
      const p = path.resolve(pkg, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, "");
    }
    expect(basrunPath({}, pkg)).toBe(path.resolve(pkg, SIBLING_CANDIDATES[0] as string));
  });

  it("with nothing found, fails with clone instructions and the paths searched", () => {
    const pkg = path.join(tmpDir(), "ailine-ts");
    fs.mkdirSync(pkg, { recursive: true });
    try {
      basrunPath({}, pkg);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AilineError);
      const msg = (err as AilineError).message;
      expect(msg).toContain("git clone");
      expect(msg).toContain("BASRUN_TS");
      expect(msg).toContain(path.resolve(pkg, SIBLING_CANDIDATES[0] as string));
    }
  });

  it("resolves the real sibling in this checkout", () => {
    expect(fs.existsSync(basrunPath({}))).toBe(true);
  });
});

describe("ollama-generate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to localhost and strips trailing slashes", () => {
    expect(ollamaHost({})).toBe("http://localhost:11434");
    expect(ollamaHost({ OLLAMA_HOST: "http://127.0.0.1:1234/" })).toBe("http://127.0.0.1:1234");
  });

  it("posts the documented body shape and returns message.content", async () => {
    let seen: unknown;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      seen = JSON.parse(init.body);
      return new Response(JSON.stringify({ message: { content: "Sub Run(oDoc As Object)\nEnd Sub" } }), { status: 200 });
    });
    const out = await ollamaGenerate("m", [{ role: "user", content: "hi" }], 0.3, {});
    expect(out).toContain("Sub Run(oDoc As Object)");
    expect(seen).toMatchObject({
      model: "m",
      stream: false,
      options: { temperature: 0.3, num_predict: 1600, num_ctx: 8192 },
    });
  });

  it("a 200 with no content returns '' rather than raising", async () => {
    // nodes/ollama-generate.md ③: the empty string is meant to fail the
    // signature check downstream and enter the repair loop normally.
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: {} }), { status: 200 }));
    expect(await ollamaGenerate("m", [], 0.2, {})).toBe("");
  });

  it("a connection failure is FATAL, not retryable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(ollamaGenerate("m", [], 0.2, {})).rejects.toBeInstanceOf(AilineFatalError);
    await expect(ollamaGenerate("m", [], 0.2, {})).rejects.toThrow("ollama serve");
  });

  it("a non-2xx response is fatal too", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500, statusText: "Server Error" }));
    await expect(ollamaGenerate("m", [], 0.2, {})).rejects.toBeInstanceOf(AilineFatalError);
  });
});

describe("misc", () => {
  it("outPath is the safe-copy default: sample.xlsx -> sample.out.xlsx", () => {
    expect(path.basename(outPath("/x/sample.xlsx"))).toBe("sample.out.xlsx");
    expect(path.basename(outPath("/x/sales.ods"))).toBe("sales.out.ods");
  });

  it("chartsCount reads a real .xlsx and finds no charts in the fixture", () => {
    expect(chartsCount(path.join(PKG_ROOT, "tests", "fixture.xlsx"))).toBe(0);
  });

  it("chartsCount is total: a non-zip file yields 0 rather than throwing", () => {
    const p = path.join(tmpDir(), "not-a-zip.xlsx");
    fs.writeFileSync(p, "definitely not a zip");
    expect(chartsCount(p)).toBe(0);
  });
});

describe("cli-overview — help vs. no-subcommand", () => {
  it("--help is a help request, exit 0", () => {
    // commander writes help to stdout, which is correct for a real user and
    // noise in a test log. Swallow it here rather than muting writeOut in the
    // shipped parser.
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      expect(parseArgv(["--help"], {}).command).toBe("help");
      expect(parseArgv(["run", "--help"], {}).command).toBe("help");
    } finally {
      write.mockRestore();
    }
  });
});
