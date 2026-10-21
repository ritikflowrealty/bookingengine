// Audit log helpers. Client-safe.

/** Keys of before/after with whether each changed. Non-objects compare as a single "value" key. */
export function diffKeys(before: unknown, after: unknown) {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : v === null || v === undefined ? {} : { value: v });
  const b = obj(before);
  const a = obj(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].map((key) => ({ key, before: b[key], after: a[key], changed: JSON.stringify(b[key]) !== JSON.stringify(a[key]) }));
}
