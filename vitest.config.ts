import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/unit is pure logic and fast. tests/e drives a real ollama round
    // trip plus a real LibreOffice apply through basrun-ts, and a single
    // attempt there is tens of seconds — give the whole layer room.
    //
    // 600s is deliberately generous but bounded (the slowest row measured is
    // ~130s). ailine puts no timeout on the basrun subprocess — faithful to
    // the original — so if LibreOffice ever wedges on startup, an apply
    // blocks forever and only this ceiling ends the row. Seen once for real:
    // LibreOffice crashed mid-run and the restart hung on its recovery
    // prompt.
    testTimeout: 600_000,
    hookTimeout: 300_000,
  },
});
