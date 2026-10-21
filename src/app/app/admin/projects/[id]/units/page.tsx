import { getDb } from "@/db";
import { requireAdmin } from "@/lib/admin/guard";
import { loadUnitFields } from "@/lib/admin/units-db";
import { adminProject } from "../../data";
import { UnitsEditor } from "./UnitsEditor";

export default async function UnitsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ import?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { project } = await adminProject(id);
  const { towers, fields } = await loadUnitFields(await getDb(), id);
  return <UnitsEditor projectId={id} plotted={project.type === "plotted"} units={fields} towers={towers.map((t) => t.code).sort()} openImport={!!(await searchParams).import} />;
}
