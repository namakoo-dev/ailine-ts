import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeBook } from "../../src/describeBook.js";
import { makeBook, tmpDir } from "./_book.js";

/**
 * GOLDEN.md section D — the document description handed to the model.
 *
 * The 0-origin column numbering is the load-bearing part: it is the same
 * coordinate system CONTRACT forces on the generated code, so nothing has to
 * be translated between what the model reads and what it writes
 * (nodes/describe-book.md ②).
 */
describe("GOLDEN D — describe-book", () => {
  it("D1: lists sheets and 0-origin headers", async () => {
    const book = await makeBook(path.join(tmpDir(), "b.xlsx"));
    const out = await describeBook(book);
    expect(out).toContain("列0=商品");
    expect(out).toContain("列1=金額");
    expect(out).toContain("シート一覧");
  });
});
