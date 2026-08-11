import { auth } from "@/auth";
import { GuestAppShell } from "@/components/guest/guest-app-shell";

/**
 * Misafir kabuğu oturumdan haberdar: giriş yapmış kullanıcı için header
 * "Giriş Yap" yerine hesap/panel bağlantısı gösterir. Oturum sunucuda
 * çözülür, istemci kabuğuna yalnızca gösterim için gerekli alanlar geçer.
 */
export default async function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;

  return (
    <GuestAppShell
      account={
        user
          ? {
              name: user.name ?? user.email ?? "Hesabım",
              role: user.role === "admin" ? "admin" : "manager",
            }
          : null
      }
    >
      {children}
    </GuestAppShell>
  );
}
