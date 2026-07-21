import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Center } from "@mantine/core";
import { PanelProviders } from "@/components/panel-providers";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Şifremi unuttum",
};

export default function SifremiUnuttumPage() {
  return (
    <PanelProviders>
      <Center mih="100vh" p="md" bg="var(--mantine-color-gray-0)">
        <ForgotPasswordForm />
      </Center>
    </PanelProviders>
  );
}
