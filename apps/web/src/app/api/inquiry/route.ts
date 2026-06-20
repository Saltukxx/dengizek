import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { inquiryFormSchema } from "@/lib/schemas/inquiry";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, inquiriesTable, roomsTable } from "@/lib/db/schema";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { generateAccessToken, trackEvent } from "@/lib/analytics";
import { notifyHotelMembers } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { validateStayDates } from "@/lib/stay-dates";

async function insertInquiryWithToken(
  db: ReturnType<typeof getDb>,
  values: typeof inquiriesTable.$inferInsert,
  maxAttempts = 3,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const [inquiry] = await db
        .insert(inquiriesTable)
        .values({ ...values, accessToken: values.accessToken ?? generateAccessToken() })
        .returning();
      return inquiry;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/unique|duplicate/i.test(msg) || attempt === maxAttempts - 1) throw err;
    }
  }
  throw new Error("Talep oluşturulamadı.");
}

export async function POST(req: Request) {
  if (!checkRateLimit(requestIp(req), { name: "inquiry", windowMs: 60_000, limit: 5 })) {
    return NextResponse.json(
      { ok: false, error: "Çok fazla istek gönderdiniz, lütfen biraz bekleyin." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = inquiryFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!isDbConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info("[inquiry:mock]", parsed.data);
    }
    return NextResponse.json({ ok: true, id: `mock-${Date.now()}` });
  }

  const db = getDb();
  const data = parsed.data;

  const dates = validateStayDates(data.checkIn, data.checkOut);
  if (!dates.ok) {
    return NextResponse.json({ ok: false, error: dates.error }, { status: 400 });
  }

  let hotelId: string | null = null;
  if (data.hotelSlug) {
    const [hotel] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(eq(hotelsTable.slug, data.hotelSlug))
      .limit(1);
    hotelId = hotel?.id ?? null;
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

  const inquiry = await insertInquiryWithToken(db, {
    hotelId,
    hotelSlug: data.hotelSlug ?? null,
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    message: data.message,
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
    accessToken: generateAccessToken(),
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
      body: `${data.name} — ${data.message.slice(0, 80)}`,
      link: "/dashboard/inquiries",
    });
  }

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/inquiry/portal/${inquiry.accessToken}`;
  void sendEmail({
    to: data.email,
    subject: "Talebiniz alındı — Dengizek",
    text: `Merhaba ${data.name},\n\nTalebiniz otele iletildi. Yanıtları takip etmek için: ${portalUrl}`,
  });

  return NextResponse.json({ ok: true, id: inquiry.id });
}
