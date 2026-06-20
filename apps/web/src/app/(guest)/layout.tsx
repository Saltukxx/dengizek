import { GuestAppShell } from "@/components/guest/guest-app-shell";

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GuestAppShell>{children}</GuestAppShell>;
}
