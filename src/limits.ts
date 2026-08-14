/**
 * Safety caps shared by describe-book and snapshot.
 *
 * nodes/describe-book.md ④ is explicit that these two units share the same
 * constants (they were module-level in the original), and nodes/snapshot.md ③
 * notes the consequence: changes outside this window are not captured by the
 * no-op guard at all. Keeping them in one place keeps that coupling visible.
 */
export const MAX_ROWS = 1000;
export const MAX_COLS = 64;
