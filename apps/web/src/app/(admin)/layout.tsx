import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PanelProviders } from "@/components/panel-providers";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware'e ek sunucu tarafı savunma — yalnızca admin
  const session = await auth();
  if (!session?.user) {
    redirect("/giris?callbackUrl=/admin");
  }
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <PanelProviders>
      <AdminShell userName={session.user.name ?? session.user.email ?? undefined}>
        {children}
      </AdminShell>
    </PanelProviders>
  );
}
