// ---------------------------------------------------------------------------
// Yetki bekçileri (guards) — API route'larında kullanılır
//
// Kullanım kalıbı:
//   const guard = await requireAdmin();
//   if (guard.response) return guard.response;   // 401/403 JSON
//   const user = guard.user;                     // oturum kullanıcısı
//
// Tenant izolasyonunun TEK kaynağı requireHotelAccess'tir — istemciden gelen
// hotelId'ye asla doğrudan güvenilmez.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { hotelMembersTable, hotelsTable, usersTable } from "@/lib/db/schema";
import type { MemberRole } from "@/lib/db/schema";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager";
  tokenVersion: number;
}

type GuardResult =
  | { user: SessionUser; response: null }
  | { user: null; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Oturum açmanız gerekiyor." },
    { status: 401 },
  );
}

function sessionRevoked(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "SESSION_REVOKED", error: "Oturumunuz geçersiz kılındı. Lütfen tekrar giriş yapın." },
    { status: 401 },
  );
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

/** Oturum açmış herhangi bir kullanıcı gerektirir. */
export async function requireUser(): Promise<GuardResult> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return { user: null, response: unauthorized() };
  const db = getDb();
  const [current] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      tokenVersion: usersTable.tokenVersion,
    })
    .from(usersTable)
    .where(eq(usersTable.id, u.id))
    .limit(1);
  if (!current?.isActive || current.tokenVersion !== u.tokenVersion) {
    return { user: null, response: sessionRevoked() };
  }
  return {
    user: {
      id: current.id,
      email: current.email,
      name: current.name,
      role: current.role,
      tokenVersion: current.tokenVersion,
    },
    response: null,
  };
}

/** Yalnızca platform yöneticisi (admin). */
export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireUser();
  if (result.response) return result;
  if (result.user.role !== "admin") {
    return {
      user: null,
      response: forbidden("Bu işlem için yönetici yetkisi gerekli."),
    };
  }
  return result;
}

type HotelGuardResult =
  | { user: SessionUser; hotel: { id: string; slug: string; name: string; aiPersona: string; aiPolicies: string[]; cancellationPolicy: string | null }; response: null }
  | { user: null; hotel: null; response: NextResponse };

/**
 * Kullanıcının verilen otele (id veya slug) erişimini doğrular.
 * - admin her otele erişir;
 * - manager için hotel_members kaydı aranır;
 * - minRole "owner" ise editor üyeliği yetmez.
 * Otel bulunamazsa bilgi sızdırmamak için yine 403 döner.
 */
export async function requireHotelAccess(
  hotelIdOrSlug: string,
  minRole: MemberRole = "editor",
): Promise<HotelGuardResult> {
  const result = await requireUser();
  if (result.response) return { user: null, hotel: null, response: result.response };
  const user = result.user;

  const db = getDb();

  // Otel id (uuid) veya slug ile bulunur
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    hotelIdOrSlug,
  );
  const [hotel] = await db
    .select({ id: hotelsTable.id, slug: hotelsTable.slug, name: hotelsTable.name, aiPersona: hotelsTable.aiPersona, aiPolicies: hotelsTable.aiPolicies, cancellationPolicy: hotelsTable.cancellationPolicy })
    .from(hotelsTable)
    .where(isUuid ? eq(hotelsTable.id, hotelIdOrSlug) : eq(hotelsTable.slug, hotelIdOrSlug))
    .limit(1);

  if (!hotel) {
    return { user: null, hotel: null, response: forbidden("Bu tesise erişim yetkiniz yok.") };
  }

  if (user.role === "admin") {
    return { user, hotel, response: null };
  }

  const [membership] = await db
    .select({ role: hotelMembersTable.role })
    .from(hotelMembersTable)
    .where(
      and(
        eq(hotelMembersTable.userId, user.id),
        eq(hotelMembersTable.hotelId, hotel.id),
      ),
    )
    .limit(1);

  if (!membership) {
    return { user: null, hotel: null, response: forbidden("Bu tesise erişim yetkiniz yok.") };
  }
  if (minRole === "owner" && membership.role !== "owner") {
    return {
      user: null,
      hotel: null,
      response: forbidden("Bu işlem için tesis sahibi yetkisi gerekli."),
    };
  }

  return { user, hotel, response: null };
}
