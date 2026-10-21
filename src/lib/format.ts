/** ₹ with Indian digit grouping, rounded to the rupee: 8847000 → "₹88,47,000", -236 → "−₹236". */
export function formatINR(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "−₹" : "₹") + Math.abs(r).toLocaleString("en-IN");
}

/** 1065 → "1,065", 2377.34 → "2,377.34". */
export const formatArea = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** "21 Oct 2026, 6:30 pm" in IST, whatever the server's timezone. */
export const formatDateTime = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
