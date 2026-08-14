import { describe, expect, it } from "vitest";
import { extractBas } from "../../src/extractBas.js";
import { validSignature } from "../../src/validSignature.js";

/**
 * GOLDEN.md section A — code extraction and signature checking.
 * A1-A2 (extract-bas), A3-A7 (valid-signature, one parametrized case each in
 * the original's `test_valid_signature`).
 */

describe("GOLDEN A — extract-bas", () => {
  it("A1: strips a markdown fence, keeping the body", () => {
    const raw = "説明文が先にある\n```basic\nOption Explicit\nSub Run(oDoc As Object)\nEnd Sub\n```\n後書き";
    const out = extractBas(raw);
    expect(out.startsWith("Option Explicit")).toBe(true);
    expect(out).not.toContain("```");
  });

  it("A2: passes unfenced text through unchanged", () => {
    const raw = "Sub Run(oDoc As Object)\nEnd Sub";
    expect(extractBas(raw)).toBe(raw);
  });
});

describe("GOLDEN A — valid-signature", () => {
  it.each([
    ["A3", "Sub Run(oDoc As Object)\nEnd Sub", true],
    ["A4", "sub run( oDoc as object )", true],
    ["A5", "Sub Run()\nEnd Sub", false],
    ["A6", "Sub Other(oDoc As Object)", false],
    ["A7", "' コメントだけ", false],
  ])("%s: %j -> %s", (_row, code, expected) => {
    expect(validSignature(code as string)).toBe(expected);
  });
});
