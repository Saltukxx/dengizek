import type { Metadata } from "next";
import { InquirySuccessPage } from "@/components/guest/inquiry-success";

export const metadata: Metadata = {
  title: "Kış talebi alındı",
  robots: { index: false, follow: false },
};

export default function WinterInquirySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>;
}) {
  return <InquirySuccessPage searchParams={searchParams} surface="kis" />;
}
