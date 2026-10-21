import { requireStaff } from "@/lib/auth/session";
import { projectsWithCounts } from "@/lib/inventory/queries";
import { PageHeader } from "@/components/ui";
import { ProjectCard } from "@/components/ProjectCard";

export default async function Projects() {
  const user = await requireStaff();
  const projects = await projectsWithCounts(user.actor);
  return (
    <>
      <PageHeader eyebrow="Inventory" title="Projects" subtitle="Pick a project to see live availability, towers and prices." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} href={`/app/projects/${p.slug}`} name={p.name} developer={p.developer} city={p.city} type={p.type} accent={p.accentColor} counts={p.counts} />
        ))}
      </div>
    </>
  );
}
