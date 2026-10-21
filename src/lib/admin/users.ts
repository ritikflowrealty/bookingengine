// Reporting tree helpers. Client-safe.
export type TreeNode = { id: string; managerId: string | null };

/** Would making `managerId` the manager of `userId` create a loop (A → B → … → A)? */
export function createsCycle(users: TreeNode[], userId: string, managerId: string | null) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const seen = new Set<string>();
  for (let cur = managerId; cur; cur = byId.get(cur)?.managerId ?? null) {
    if (cur === userId || seen.has(cur)) return true;
    seen.add(cur);
  }
  return false;
}

/** Depth-first order with depth, roots first (users whose manager is missing count as roots). */
export function flattenTree<T extends TreeNode & { name: string }>(users: T[]): { user: T; depth: number }[] {
  const ids = new Set(users.map((u) => u.id));
  const kids = new Map<string | null, T[]>();
  for (const u of users) {
    const k = u.managerId && ids.has(u.managerId) ? u.managerId : null;
    kids.set(k, [...(kids.get(k) ?? []), u]);
  }
  const out: { user: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const u of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push({ user: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
