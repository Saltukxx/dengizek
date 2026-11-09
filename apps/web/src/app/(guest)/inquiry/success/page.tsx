import type { Metadata } from "next";
import { InquirySuccessPage } from "@/components/guest/inquiry-success";

export const metadata: Metadata = {
  title: "Talep alındı",
  robots: { index: false, follow: false },
};

export default function SummerInquirySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ emailStatus?: string }>;
}) {
  return <InquirySuccessPage searchParams={searchParams} />;
}
