"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { adminUser, run } from "@/lib/admin/guard";
import { activatePriceList, archivePriceList, createDraft, duplicatePriceList, saveDraft } from "@/lib/admin/pricelists";

const name = z.string().trim().min(1, "Name is required").max(120);
const date = z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.date().nullable());

async function act<T>(fn: (userId: string) => Promise<T>) {
  return run(async () => {
    const user = await adminUser("pricelist.edit");
    const r = await fn(user.id);
    revalidatePath("/app", "layout");
    return r;
  });
}

export async function createPriceListAction(projectId: string, listName: string) {
  return act(async (uid) => ({ id: (await createDraft(await getDb(), uid, z.uuid().parse(projectId), name.parse(listName))).id }));
}

export async function duplicatePriceListAction(id: string) {
  return act(async (uid) => ({ id: (await duplicatePriceList(await getDb(), uid, z.uuid().parse(id))).id }));
}

export async function activatePriceListAction(id: string) {
  return act(async (uid) => ((await activatePriceList(await getDb(), uid, z.uuid().parse(id))), true));
}

export async function archivePriceListAction(id: string) {
  return act(async (uid) => ((await archivePriceList(await getDb(), uid, z.uuid().parse(id))), true));
}

const draftSchema = z.object({ name, validFrom: date, validTo: date, config: z.unknown() }).refine((v) => !v.validFrom || !v.validTo || v.validTo > v.validFrom, "Valid to must be after valid from");

export async function savePriceListAction(id: string, input: z.input<typeof draftSchema>) {
  return act(async (uid) => ((await saveDraft(await getDb(), uid, z.uuid().parse(id), draftSchema.parse(input))), true));
}
