import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PanelProviders } from "@/components/panel-providers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HotelProvider } from "@/components/dashboard/hotel-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware'e ek sunucu tarafı savunma — oturum yoksa girişe yönlendir
  const session = await auth();
  if (!session?.user) {
    redirect("/giris?callbackUrl=/dashboard");
  }

  return (
    <PanelProviders>
      <HotelProvider>
        <DashboardShell userName={session.user.name ?? session.user.email ?? undefined}>
          {children}
        </DashboardShell>
      </HotelProvider>
    </PanelProviders>
  );
}
