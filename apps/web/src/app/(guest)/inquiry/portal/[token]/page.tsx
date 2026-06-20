import { InquiryPortalClient } from "./portal-client";

type PageProps = { params: Promise<{ token: string }> };

export default async function InquiryPortalPage({ params }: PageProps) {
  const { token } = await params;
  return <InquiryPortalClient token={token} />;
}
