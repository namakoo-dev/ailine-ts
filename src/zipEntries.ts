import fs from "node:fs";

/**
 * Minimal ZIP central-directory reader — entry names only.
 *
 * Used for one thing: counting `xl/charts/chart*.xml` inside an .xlsx, which
 * is exactly the technique the original's `_charts_count` used
 * (nodes/snapshot.md ①). exceljs's object model does not expose charts, and
 * pulling in a zip library for a filename count would be a poor trade.
 *
 * Deliberately total: any malformed/unreadable archive yields [] rather than
 * throwing. A snapshot must never fail the whole run over its least
 * significant axis.
 */
export function zipEntryNames(filePath: string): string[] {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return [];
  }
  const eocd = findEocd(buf);
  if (eocd < 0) {
    return [];
  }
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.toString("utf8", offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** End of central directory: signature 0x06054b50, within the last 64KB+22. */
function findEocd(buf: Buffer): number {
  const start = Math.max(0, buf.length - (0xffff + 22));
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

export function chartsCount(filePath: string): number {
  return zipEntryNames(filePath).filter((n) => /(^|\/)charts\/chart[^/]*\.xml$/i.test(n)).length;
}
