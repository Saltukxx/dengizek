import { Stack, Text, Title } from "@mantine/core";
import { BookingsPaymentsView } from "@/components/admin/bookings-payments-view";

export default function AdminBookingsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Rezervasyonlar ve ödemeler</Title>
        <Text c="dimmed" size="sm">
          Platform genelinde tüm tesislerin rezervasyon ve ödeme kayıtları (salt okunur).
        </Text>
      </div>
      <BookingsPaymentsView />
    </Stack>
  );
}
