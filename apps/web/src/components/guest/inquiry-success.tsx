import Link from "next/link";
import { IconCircleCheck } from "@tabler/icons-react";
import { PageBanner } from "./page-banner";
import { guestPaths, type GuestSurface } from "@/lib/guest-surface";

// Talep başarı sayfası — yaz (/inquiry/success) kış (/kis/talep/basarili) ve termal
// rotaları aynı bileşeni kullanır. Next sayfa dosyası ek dışa aktarım
// kabul etmediği için bileşen burada durur.

const BACK_LABELS: Record<GuestSurface, string> = {
  yaz: "Keşfet Sayfasına Dön",
  kis: "Kış Otellerine Dön",
  termal: "Termal Otellere Dön",
};

export async function InquirySuccessPage({
  searchParams,
  surface = "yaz",
}: {
  searchParams: Promise<{ emailStatus?: string }>;
  surface?: GuestSurface;
}) {
  const { emailStatus } = await searchParams;
  const statusMessage =
    emailStatus === "sent"
      ? "Talebiniz otele iletildi ve takip bağlantınız e-posta adresinize gönderildi."
      : emailStatus === "queued"
        ? "Talebiniz otele iletildi. Takip e-postanız gönderim kuyruğuna alındı."
        : "Talebiniz otele iletildi. E-posta bildirimi şu anda gönderilemiyor; takip bağlantınız hazır olduğunda e-postanıza ulaşacak.";
  return (
    <>
      <PageBanner
        eyebrow={
          <>
            <IconCircleCheck size={16} aria-hidden /> Mesajınız alındı
          </>
        }
        title="Teşekkürler"
        lede={statusMessage}
      >
        <Link href={guestPaths(surface).browse} className="er-btn er-btn-cta">
          {BACK_LABELS[surface]}
        </Link>
      </PageBanner>
      <div className="er-container" style={{ paddingBlock: "clamp(24px, 4vw, 40px)" }}>
        <p className="er-muted" style={{ margin: 0 }}>
          Otelin cevabı e-postanıza gelen bağlantıdaki talep sayfasında görünür.
        </p>
      </div>
    </>
  );
}

