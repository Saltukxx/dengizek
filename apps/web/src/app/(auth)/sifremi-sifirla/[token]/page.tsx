import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Center } from "@mantine/core";
import { PanelProviders } from "@/components/panel-providers";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Şifre sıfırla",
};

export default async function SifremiSifirlaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PanelProviders>
      <Center mih="100vh" p="md" bg="var(--mantine-color-gray-0)">
        <ResetPasswordForm token={token} />
      </Center>
    </PanelProviders>
  );
}
