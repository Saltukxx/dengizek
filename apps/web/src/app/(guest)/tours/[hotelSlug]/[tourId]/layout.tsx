import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProviders } from "@/components/mantine-providers";

export default function TourLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MantineProviders>{children}</MantineProviders>;
}
