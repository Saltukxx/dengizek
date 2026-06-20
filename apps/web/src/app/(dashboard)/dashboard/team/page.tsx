import { Stack, Text, Title } from "@mantine/core";
import { TeamManager } from "@/components/dashboard/team-manager";

export default function DashboardTeamPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Ekip</Title>
        <Text c="dimmed" size="sm">
          Tesis üyelerini yönetin — yalnızca sahip erişebilir.
        </Text>
      </div>
      <TeamManager />
    </Stack>
  );
}
