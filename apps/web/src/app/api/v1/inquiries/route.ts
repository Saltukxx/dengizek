// ---------------------------------------------------------------------------
// POST /api/v1/inquiries — iOS uygulamasından talep. Web formuyla aynı işleyici
// (doğrulama, hız sınırı, iletişim koruması, e-posta ile portal bağlantısı);
// uygulama bu sabit adresi kullanır ki web rotası taşınsa da bozulmasın.
// ---------------------------------------------------------------------------

export { POST } from "@/app/api/inquiry/route";
