import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { ProjectForm } from "../ProjectForm";
import { adminProject, projectFormValues } from "../data";

export default async function ProjectDetails({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { project } = await adminProject(id);
  const developers = await (await getDb()).query.developers.findMany({ orderBy: asc(s.developers.name), columns: { id: true, name: true } });
  return <ProjectForm id={project.id} initial={projectFormValues(project)} developers={developers} />;
}
