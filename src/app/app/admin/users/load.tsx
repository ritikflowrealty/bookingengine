import "server-only";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { ROLE_LABEL } from "@/lib/admin/shared";
import { PageHeader } from "@/components/ui";
import { UserForm, type UserFormValues } from "./UserForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** New-user and edit-user pages share everything but the initial values. */
export async function UserPage({ id }: { id: string | null }) {
  const me = await requireAdmin();
  if (id && !UUID.test(id)) notFound();
  const db = await getDb();
  const [users, projects, developers] = await Promise.all([
    db.query.users.findMany({ orderBy: asc(s.users.name), columns: { id: true, name: true, managerId: true, role: true, active: true } }),
    db.query.projects.findMany({ orderBy: asc(s.projects.name), columns: { id: true, name: true } }),
    db.query.developers.findMany({ orderBy: asc(s.developers.name), columns: { id: true, name: true } }),
  ]);
  const user = id ? await db.query.users.findFirst({ where: eq(s.users.id, id) }) : null;
  if (id && !user) notFound();
  const projectIds = id ? (await db.select().from(s.userProjects).where(eq(s.userProjects.userId, id))).map((r) => r.projectId) : [];
  const initial: UserFormValues = {
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? "sales_manager",
    managerId: user?.managerId ?? "",
    allProjects: user?.allProjects ?? false,
    projectIds,
    developerId: user?.developerId ?? "",
    canBlock: user?.canBlock ?? false,
    active: user?.active ?? true,
  };
  return (
    <>
      <PageHeader eyebrow="Admin · Users" title={user ? user.name : "New user"} subtitle={user ? `${ROLE_LABEL[user.role]} · ${user.email}` : "Create a staff account and give it access."} />
      <UserForm id={id} initial={initial} users={users.filter((u) => u.active || u.id === user?.managerId)} projects={projects} developers={developers} self={id === me.id} />
    </>
  );
}
