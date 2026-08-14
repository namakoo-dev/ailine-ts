// Measures what the no-op guard reports for a macro that genuinely does
// nothing — once against a freshly authored book, once against a book that
// has already been through a LibreOffice save.
//
// Run: node tests/noopProbe.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { basrunApply } from "../dist/basrunApply.js";
import { diffSnapshots } from "../dist/diffSnapshots.js";
import { snapshot } from "../dist/snapshot.js";

const EMPTY = "Option VBASupport 1\nOption Explicit\n\nSub Run(oDoc As Object)\nEnd Sub\n";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ailine-noop-"));

async function applyEmpty(src, label) {
  const book = path.join(work, `${label}.xlsx`);
  fs.copyFileSync(src, book);
  const before = await snapshot(book);
  const r = await basrunApply(book, EMPTY, work, []);
  if (!r.ok) {
    console.log(`${label}: APPLY FAILED\n${r.error}`);
    return null;
  }
  const after = await snapshot(book);
  const d = diffSnapshots(before, after);
  console.log(`${label}: changed=${d.changed}  lines=${JSON.stringify(d.lines)}`);
  return book;
}

const fresh = path.resolve(import.meta.dirname, "..", "demo", "sample.xlsx");
const once = await applyEmpty(fresh, "pass1-fresh-book");
if (once) {
  await applyEmpty(once, "pass2-already-LO-saved");
}
