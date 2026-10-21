import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../ProjectForm";
import { projectFormValues } from "../data";

export default async function NewProject() {
  await requireAdmin();
  const developers = await (await getDb()).query.developers.findMany({ orderBy: asc(s.developers.name), columns: { id: true, name: true } });
  return (
    <>
      <PageHeader eyebrow="Admin · Projects" title="New project" subtitle="Start with the basics; towers, units and prices come next." />
      <ProjectForm id={null} initial={projectFormValues()} developers={developers} />
    </>
  );
}
