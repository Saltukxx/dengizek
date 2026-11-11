// iOS universal link tanımı (/.well-known/apple-app-site-association içeriği).

/** Apple ekip kimliği ve uygulama paket kimliği (APNs ile aynı değerler). */
const DEFAULT_TEAM_ID = "KRQ4U9G63K";
const DEFAULT_BUNDLE_ID = "com.gbsoft.otelsayfam";

export function appSiteAssociation(env: NodeJS.ProcessEnv = process.env) {
  const teamId = env.APNS_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
  const bundleId = env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${bundleId}`],
          // Yalnız otel sayfaları; talep portalı ve panel tarayıcıda kalır.
          components: [{ "/": "/hotels/*", comment: "Otel ve oda sayfaları" }],
        },
      ],
    },
  };
}
