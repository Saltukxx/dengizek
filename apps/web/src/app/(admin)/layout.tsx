import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { PanelProviders } from "@/components/panel-providers";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware'e ek sunucu tarafı savunma — yalnızca admin
  const guard = await requireAdmin();
  if (guard.response?.status === 401) {
    redirect("/giris?callbackUrl=/admin");
  }
  if (guard.response || !guard.user) {
    redirect("/dashboard");
  }

  return (
    <PanelProviders>
      <AdminShell userName={guard.user.name || guard.user.email || undefined}>
        {children}
      </AdminShell>
    </PanelProviders>
  );
}
