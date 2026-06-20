"use client";

import { Stack, Tabs, Text, Title } from "@mantine/core";
import { AvailabilityManager } from "@/components/dashboard/availability-manager";
import { InventoryManager } from "@/components/dashboard/inventory-manager";

export default function DashboardAvailabilityPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Müsaitlik</Title>
        <Text c="dimmed" size="sm">
          Sezon notları, kapalı dönem bilgilendirmeleri ve günlük oda envanteri.
        </Text>
      </div>
      <Tabs defaultValue="notes">
        <Tabs.List>
          <Tabs.Tab value="notes">Notlar</Tabs.Tab>
          <Tabs.Tab value="inventory">Envanter</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="notes" pt="md">
          <AvailabilityManager />
        </Tabs.Panel>
        <Tabs.Panel value="inventory" pt="md">
          <InventoryManager />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
