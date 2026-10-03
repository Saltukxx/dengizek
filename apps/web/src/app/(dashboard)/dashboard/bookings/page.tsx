import { Stack, Text, Title } from "@mantine/core";
import { BookingsManager } from "@/components/dashboard/bookings-manager";

export default function DashboardBookingsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Rezervasyonlar</Title>
        <Text c="dimmed" size="sm">
          Rezervasyonları listede veya takvimde izleyin; onay, giriş ve çıkışı buradan kaydedin.
        </Text>
      </div>
      <BookingsManager />
    </Stack>
  );
}
