"use client";

// ---------------------------------------------------------------------------
// Panel sağlayıcıları — yönetim arayüzleri her zaman AYDINLIK temada çalışır
// (misafir sitesi koyu kalır). forceColorScheme kök ColorSchemeScript'in
// "dark" değerini geçersiz kılar.
// ---------------------------------------------------------------------------

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { panelTheme } from "@/theme/panel-theme";
import type { ReactNode } from "react";

export function PanelProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider forceColorScheme="light" theme={panelTheme}>
      <Notifications position="top-right" zIndex={1000} />
      {children}
    </MantineProvider>
  );
}
