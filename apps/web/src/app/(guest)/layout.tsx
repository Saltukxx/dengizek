import { auth } from "@/auth";
import { GuestAppShell } from "@/components/guest/guest-app-shell";
import { getActiveAdTags } from "@/lib/ad-tags-repo";

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
  const [session, adTags] = await Promise.all([auth(), getActiveAdTags()]);
  const user = session?.user;

  return (
    <GuestAppShell
      adTags={adTags}
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
