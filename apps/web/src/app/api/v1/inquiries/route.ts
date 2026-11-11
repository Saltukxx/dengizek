// ---------------------------------------------------------------------------
// POST /api/v1/inquiries — iOS uygulamasından talep. Web formuyla aynı işleyici
// (doğrulama, hız sınırı, iletişim koruması, e-posta ile portal bağlantısı);
// uygulama bu sabit adresi kullanır ki web rotası taşınsa da bozulmasın.
// Web'den farkı: yanıtta `portalUrl` da döner (uygulamadaki "Talepleriniz").
// ---------------------------------------------------------------------------

import { handleInquiry } from "@/lib/inquiry-submit";

export async function POST(req: Request) {
  return handleInquiry(req, { includePortalUrl: true });
}
