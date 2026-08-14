import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadHelpers } from "../../src/loadHelpers.js";
import { loadRefs } from "../../src/loadRefs.js";
import { PKG_ROOT, tmpDir } from "./_book.js";

/**
 * GOLDEN.md section B — the shipped few-shot and helper assets.
 *
 * B1/B3 run against the real `refs/` and `helpers/` directories, which are
 * byte-for-byte copies of library-ailine/golden/ (ASSETS.md: these are
 * carried, not ported). So these two rows also assert that the assets
 * actually arrived intact.
 */

const REFS = path.join(PKG_ROOT, "refs");
const HELPERS = path.join(PKG_ROOT, "helpers");

describe("GOLDEN B — load-refs", () => {
  it("B1: bundles the shipped examples with a 参考 envelope", () => {
    const out = loadRefs(REFS);
    expect(out).toContain("Sub Run(oDoc As Object)");
    expect(out).toContain("参考");
  });

  it("B2: a missing directory yields the empty string", () => {
    expect(loadRefs(path.join(tmpDir(), "no-such-dir"))).toBe("");
  });
});

describe("GOLDEN B — load-helpers", () => {
  it("B3: catalog names the helpers and demands Call; files are .bas paths", () => {
    const { catalog, files } = loadHelpers(HELPERS);
    expect(catalog).toContain("SortByColumn");
    expect(catalog).toContain("InsertBarChart");
    expect(catalog).toContain("Call");
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      expect(f.endsWith(".bas")).toBe(true);
    }
  });

  it("B4: a missing directory yields ('', [])", () => {
    const { catalog, files } = loadHelpers(path.join(tmpDir(), "no-such-dir"));
    expect(catalog).toBe("");
    expect(files).toEqual([]);
  });
});
