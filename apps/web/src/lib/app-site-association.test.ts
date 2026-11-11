import { describe, expect, it } from "vitest";
import { appSiteAssociation } from "./app-site-association";

describe("apple-app-site-association", () => {
  it("yalnız otel sayfalarını uygulamaya bağlar", () => {
    const { applinks } = appSiteAssociation({} as NodeJS.ProcessEnv);
    expect(applinks.details).toHaveLength(1);
    expect(applinks.details[0].appIDs).toEqual(["KRQ4U9G63K.com.gbsoft.otelsayfam"]);
    expect(applinks.details[0].components.map((c) => c["/"])).toEqual(["/hotels/*"]);
  });

  it("ekip ve paket kimliği ortam değişkeninden alınabilir", () => {
    const env = { APNS_TEAM_ID: "ABCDE12345", APNS_BUNDLE_ID: "com.example.app" } as unknown as NodeJS.ProcessEnv;
    expect(appSiteAssociation(env).applinks.details[0].appIDs).toEqual(["ABCDE12345.com.example.app"]);
  });
});
