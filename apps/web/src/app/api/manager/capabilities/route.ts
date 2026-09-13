import { requireUser } from "@/lib/auth/guards";
import { apiOk } from "@/lib/api-response";
import { getRuntimeCapabilities } from "@/lib/runtime-capabilities";

export async function GET() {
  const guard = await requireUser();
  if (guard.response) return guard.response;
  return apiOk({ capabilities: getRuntimeCapabilities() });
}
