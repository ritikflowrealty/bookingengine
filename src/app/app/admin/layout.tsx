import { requireAdmin } from "@/lib/admin/guard";
import { Tabs } from "./_components/kit";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <Tabs
        items={[
          { href: "/app/admin", label: "Overview", exact: true },
          { href: "/app/admin/projects", label: "Projects" },
          { href: "/app/admin/users", label: "Users" },
          { href: "/app/admin/audit", label: "Audit log" },
        ]}
      />
      {children}
    </>
  );
}
