import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { PROJECT_TYPE_LABEL } from "@/lib/admin/shared";
import { ButtonLink, PageHeader } from "@/components/ui";
import { Tabs } from "../../_components/kit";
import { adminProject } from "../data";

export default async function ProjectAdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { project, developer } = await adminProject(id);
  const base = `/app/admin/projects/${id}`;
  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: project.accentColor ?? "var(--purple)" }} />{developer?.name}</span>}
        title={project.name}
        subtitle={[PROJECT_TYPE_LABEL[project.type], project.city].filter(Boolean).join(" · ")}
        actions={<ButtonLink href={`/app/projects/${project.slug}`} variant="secondary"><ExternalLink className="h-4 w-4" /> Live inventory</ButtonLink>}
      />
      <Tabs
        size="md"
        items={[
          { href: base, label: "Details", exact: true },
          { href: `${base}/structure`, label: project.type === "plotted" ? "Plots" : "Structure" },
          { href: `${base}/units`, label: "Units" },
          { href: `${base}/pricing`, label: "Pricing" },
        ]}
      />
      {children}
    </>
  );
}
