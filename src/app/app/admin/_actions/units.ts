"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { adminUser, run } from "@/lib/admin/guard";
import { applyUnitChanges } from "@/lib/admin/units-db";
import { unitChangesSchema, type UnitChange } from "@/lib/admin/units";

/** Bulk editor "Save changes" and confirmed imports: one transaction, one audit row per unit. */
export async function saveUnitsAction(projectId: string, items: UnitChange[]) {
  return run(async () => {
    const user = await adminUser("inventory.edit");
    const r = await applyUnitChanges(await getDb(), user.id, projectId, unitChangesSchema.parse(items));
    revalidatePath("/app", "layout");
    return r;
  });
}
