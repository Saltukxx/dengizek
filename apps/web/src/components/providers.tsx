import type { ReactNode } from "react";

/**
 * Root provider shell — intentionally empty for now.
 * Mantine is scoped to the dashboard and tour layouts only;
 * guest pages stay Mantine-free for fast load times.
 *
 * TODO: add session, analytics, or feature-flag providers here when needed.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
