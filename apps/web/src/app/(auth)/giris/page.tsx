import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Center } from "@mantine/core";
import { PanelProviders } from "@/components/panel-providers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Giriş yap",
};

export default function GirisPage() {
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
