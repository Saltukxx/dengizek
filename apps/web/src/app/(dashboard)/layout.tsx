import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { PanelProviders } from "@/components/panel-providers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HotelProvider } from "@/components/dashboard/hotel-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware'e ek sunucu tarafı savunma — oturum yoksa girişe yönlendir
  const guard = await requireUser();
  if (guard.response || !guard.user) {
    redirect("/giris?callbackUrl=/dashboard");
  }

  return (
    <PanelProviders>
      <HotelProvider>
        <DashboardShell userName={guard.user.name || guard.user.email || undefined}>
          {children}
        </DashboardShell>
      </HotelProvider>
    </PanelProviders>
  );
}
