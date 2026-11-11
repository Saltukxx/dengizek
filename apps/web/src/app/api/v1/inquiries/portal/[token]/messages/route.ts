// ---------------------------------------------------------------------------
// GET/POST /api/v1/inquiries/portal/[token]/messages — iOS uygulamasındaki
// talep yazışması. Web portalıyla aynı işleyici (token doğrulama, moderasyon,
// hız sınırı); uygulama bu sabit adresi kullanır ki web rotası taşınsa da
// bozulmasın.
// ---------------------------------------------------------------------------

export { GET, POST } from "@/app/api/inquiry/portal/[token]/messages/route";
