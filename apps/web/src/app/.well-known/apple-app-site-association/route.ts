// ---------------------------------------------------------------------------
// GET /.well-known/apple-app-site-association — iOS universal link tanımı.
// Paylaşılan otel adresi (/hotels/{slug}) uygulama yüklüyse uygulamada açılır.
// Apple bu dosyayı HTTPS üzerinden, yönlendirmesiz ve JSON olarak ister;
// uygulama tarafında "applinks:<alan adı>" yetkisi gerekir.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { appSiteAssociation } from "@/lib/app-site-association";

export function GET() {
  return NextResponse.json(appSiteAssociation(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
