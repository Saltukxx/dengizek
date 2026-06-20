import { Stack, Text, Title } from "@mantine/core";
import { UsersTable } from "@/components/admin/users-table";

export default function AdminUsersPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Kullanıcılar</Title>
        <Text c="dimmed" size="sm">
          Otel yöneticisi hesapları oluşturun ve tesislere atayın.
        </Text>
      </div>
      <UsersTable />
    </Stack>
  );
}
