"use client";

import { PanelError } from "@/components/panel-resource-state";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PanelError message="Bu yönetim ekranı yüklenirken beklenmeyen bir sorun oluştu." onRetry={reset} />;
}
