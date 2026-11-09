import type { Metadata } from "next";
import { InquirySuccessPage } from "@/components/guest/inquiry-success";

export const metadata: Metadata = {
  title: "Termal talebi alındı",
  robots: { index: false, follow: false },
};

export default function ThermalInquirySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>;
}) {
  return <InquirySuccessPage searchParams={searchParams} surface="termal" />;
}
