"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { appTheme } from "@/theme";
import type { ReactNode } from "react";

export function MantineProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider defaultColorScheme="dark" theme={appTheme}>
      <Notifications position="top-right" zIndex={1000} />
      {children}
    </MantineProvider>
  );
}
