import { InquiryPortalClient } from "./portal-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Talep portalı",
  description: "Tesisinizle yazışın ve yorum bırakın.",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function InquiryPortalPage({ params }: PageProps) {
  const { token } = await params;
  return <InquiryPortalClient token={token} />;
}
