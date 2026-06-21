import { Stack, Text, Title } from "@mantine/core";
import { AiTourMetrics } from "@/components/dashboard/ai-tour-metrics";
import { PropertyForm } from "@/components/dashboard/property-form";

export default function DashboardPropertyPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Tesis</Title>
        <Text c="dimmed" size="sm">
          Tesis bilgilerinizi ve Yapay Zeka Rehberi profilinizi düzenleyin.
        </Text>
      </div>
      <PropertyForm />
      <AiTourMetrics />
    </Stack>
  );
}
