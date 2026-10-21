import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { assertCan, ForbiddenError, type Action } from "@/lib/auth/permissions";
export { userError } from "./errors";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Pages: only super admins may see the admin area; everyone else gets a 404. */
export async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== "super_admin") notFound();
  return user;
}

/** Server actions: re-checks the session and permission on every call. */
export async function adminUser(action: Action) {
  const user = await requireStaff();
  if (user.role !== "super_admin") throw new ForbiddenError("Only super admins can do this");
  assertCan(user.actor, action);
  return user;
}

/** Same contract as src/app/actions/inventory.ts: known errors are shown, others are logged and hidden. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const i = e.issues[0];
      return { ok: false, error: `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}` };
    }
    const err = e as Error & { status?: number; digest?: string };
    if (err.digest?.startsWith("NEXT_")) throw e; // redirect() / notFound()
    if (!err.status) console.error(e);
    return { ok: false, error: err.status ? err.message : "Something went wrong. Please try again." };
  }
}
