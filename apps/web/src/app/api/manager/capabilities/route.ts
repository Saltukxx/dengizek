import { requireUser } from "@/lib/auth/guards";
import { apiOk } from "@/lib/api-response";

export async function GET() {
  const guard = await requireUser();
  if (guard.response) return guard.response;
  return apiOk({ capabilities: { payments: process.env.PAYMENTS_ENABLED === "true" } });
}
