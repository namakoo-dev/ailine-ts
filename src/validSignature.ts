/**
 * valid-signature (あ, CROSSING.md). The pre-execution gate.
 *
 * ailine fixes the entry point at `Run` — stricter than basrun, which accepts
 * any Module.Sub — so basrun-apply-invocation can always pass a constant
 * `Gen.Run` (nodes/valid-signature.md ②).
 *
 * Case-insensitive and whitespace-tolerant; argument NAME and TYPE are part
 * of the contract, so `Sub Run(doc As Object)` and `Sub Run(oDoc As Variant)`
 * are both rejected. A match anywhere in the file is enough — CONTRACT's
 * "exactly one procedure" rule is not checked here (nodes/valid-signature.md ③).
 */
const SIGNATURE = /Sub\s+Run\s*\(\s*oDoc\s+As\s+Object\s*\)/i;

export function validSignature(code: string): boolean {
  return SIGNATURE.test(code);
}
