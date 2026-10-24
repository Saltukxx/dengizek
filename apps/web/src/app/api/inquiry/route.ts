import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { inquiryFormSchema } from "@/lib/schemas/inquiry";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, inquiriesTable, roomsTable } from "@/lib/db/schema";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";
import { notifyHotelMembers } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { validateStayDates } from "@/lib/stay-dates";
import { apiRateLimited, apiServiceUnavailable, apiFail } from "@/lib/api-response";
import { generatePortalToken, hashPortalToken, portalTokenExpiry } from "@/lib/inquiry-portal-token";
import { guestVisibleHotelBySlugWhere } from "@/lib/hotel-visibility";
import { redactContactInfo } from "@/lib/contact-guard";

async function insertInquiryWithToken(
  db: ReturnType<typeof getDb>,
  values: typeof inquiriesTable.$inferInsert,
  maxAttempts = 3,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const token = generatePortalToken();
      const [inquiry] = await db
        .insert(inquiriesTable)
        .values({ ...values, accessTokenHash: hashPortalToken(token), accessTokenExpiresAt: portalTokenExpiry() })
        .returning();
      return { inquiry, token };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/unique|duplicate/i.test(msg) || attempt === maxAttempts - 1) throw err;
    }
  }
  throw new Error("Talep oluşturulamadı.");
}

export async function POST(req: Request) {
  if (
    !(await checkRateLimit(requestIp(req), { name: "inquiry", windowMs: 60_000, limit: 5 }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryFormSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  if (!isDbConfigured()) {
    if (process.env.NODE_ENV === "development" || process.env.USE_MOCK_DATA === "true") {
      console.info("[inquiry:mock]", parsed.data);
      return NextResponse.json({
        ok: true,
        id: `mock-${Date.now()}`,
        emailSent: false,
        emailStatus: "unavailable" as const,
      });
    }
    return apiServiceUnavailable("Talep kaydı yapılandırılmamış.");
  }

  const db = getDb();
  const data = parsed.data;

  const dates = validateStayDates(data.checkIn, data.checkOut);
  if (!dates.ok) {
    return NextResponse.json({ ok: false, error: dates.error }, { status: 400 });
  }

  let hotelId: string | null = null;
  if (data.hotelSlug) {
    // Görünürlük filtresi: taslak/askıya alınmış tesise talep gönderilemez.
    const [hotel] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(guestVisibleHotelBySlugWhere(data.hotelSlug))
      .limit(1);
    if (!hotel) {
      return apiFail("Bu tesis şu anda talep kabul etmiyor.", 404);
    }
    hotelId = hotel.id;
  }

  let roomId: string | null = null;
  let roomSlug: string | null = data.roomSlug?.trim() || null;
  if (roomSlug && hotelId) {
    const [room] = await db
      .select({ id: roomsTable.id, slug: roomsTable.slug })
      .from(roomsTable)
      .where(and(eq(roomsTable.hotelId, hotelId), eq(roomsTable.slug, roomSlug)))
      .limit(1);
    if (!room) {
      return NextResponse.json(
        { ok: false, error: "Seçilen oda tipi bu otel için geçerli değil." },
        { status: 400 },
      );
    }
    roomId = room.id;
  } else if (roomSlug && !hotelId) {
    roomSlug = null;
  }

  // Ad ve mesaj tesise gösterilir: içindeki telefon/e-posta maskelenir.
  const guestName = redactContactInfo(data.name);
  const guestMessage = redactContactInfo(data.message);

  const { inquiry, token: portalToken } = await insertInquiryWithToken(db, {
    hotelId,
    hotelSlug: data.hotelSlug ?? null,
    name: guestName,
    email: data.email,
    // Telefon toplanmaz — yazışma yalnız Otelsayfam portalından yürür.
    phone: null,
    message: guestMessage,
    marketingConsent: data.marketingConsent,
    checkIn: dates.checkIn,
    checkOut: dates.checkOut,
    adults: data.adults ?? null,
    children: data.children ?? null,
    roomSlug,
    roomId,
    tourId: data.tourId ?? null,
    stepKey: data.stepKey ?? null,
    source: data.source ?? "web",
    locale: data.locale ?? "tr",
  });

  void trackEvent(
    "inquiry_submit",
    { inquiryId: inquiry.id, roomSlug, tourId: data.tourId, stepKey: data.stepKey },
    hotelId,
    data.hotelSlug,
  );

  if (hotelId) {
    void notifyHotelMembers(hotelId, {
      type: "talep",
      title: "Yeni talep",
      body: `${guestName} — ${guestMessage.slice(0, 80)}`,
      link: "/dashboard/inquiries",
    });
  }

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/inquiry/portal/${portalToken}`;
  const emailStatus = await sendEmail({
    to: data.email,
    subject: "Talebiniz alındı — Otelsayfam",
    text: `Merhaba ${data.name},\n\nTalebiniz otele iletildi. Yanıtları takip etmek için: ${portalUrl}`,
  });

  return NextResponse.json({
    ok: true,
    id: inquiry.id,
    // Geriye uyumlu alan: kuyruğa alınmak teslim edilmiş olmak değildir.
    emailSent: emailStatus === "sent",
    emailStatus,
  });
}
