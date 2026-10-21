import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can, ForbiddenError } from "@/lib/auth/permissions";
import { getInventory, getProject } from "@/lib/inventory/service";
import { toClientUnit } from "@/lib/inventory/client-unit";
import { PageHeader } from "@/components/ui";
import { Workspace } from "./Workspace";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireStaff();
  const db = await getDb();
  const project = await getProject(db, slug);
  if (!project) notFound();
  const scope = { projectId: project.id, developerId: project.developerId };
  if (!can(user.actor, "inventory.view", scope)) throw new ForbiddenError("You are not assigned to this project");
  const internal = can(user.actor, "inventory.view_internal", scope);
  const [inv, developer] = await Promise.all([getInventory(db, project.id, internal), db.query.developers.findFirst({ where: eq(s.developers.id, project.developerId) })]);

  return (
    <>
      <PageHeader eyebrow={developer?.name} title={project.name} subtitle={[project.city, project.reraNumbers.length ? `RERA ${project.reraNumbers.join(", ")}` : null].filter(Boolean).join(" · ")} />
      <Workspace
        project={{ id: project.id, name: project.name, type: project.type, accentColor: project.accentColor }}
        towers={inv.towers.map((t) => ({ id: t.id, name: t.name, code: t.code, floors: t.floors, unitsPerFloor: t.unitsPerFloor }))}
        initialUnits={inv.units.map(toClientUnit)}
        perms={{
          userId: user.id,
          internal,
          canHold: can(user.actor, "unit.hold", scope),
          canApproveHold: can(user.actor, "hold.extend.approve", scope),
          canBlock: can(user.actor, "inventory.block", scope),
          canBook: can(user.actor, "booking.create", scope),
          canShare: can(user.actor, "costsheet.share", scope),
        }}
      />
    </>
  );
}
