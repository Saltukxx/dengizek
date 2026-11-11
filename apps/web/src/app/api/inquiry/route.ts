import { handleInquiry } from "@/lib/inquiry-submit";

export async function POST(req: Request) {
  return handleInquiry(req);
}
