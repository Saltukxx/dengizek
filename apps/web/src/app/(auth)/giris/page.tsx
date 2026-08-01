import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Center } from "@mantine/core";
import { auth } from "@/auth";
import { PanelProviders } from "@/components/panel-providers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Giriş yap",
};

export default async function GirisPage() {
  // Zaten oturum açmış kullanıcıya giriş formu gösterme. Middleware yetkisiz
  // erişimi (ör. manager → /admin) buraya yönlendiriyor; yönlendirme olmazsa
  // giriş yapmış kullanıcı login sayfasında sıkışıp kalıyor.
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <PanelProviders>
      <Center mih="100vh" p="md" bg="var(--mantine-color-gray-0)">
        <Suspense>
          <LoginForm />
        </Suspense>
      </Center>
    </PanelProviders>
  );
}
