import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

const mocks = vi.hoisted(() => ({
  tourPlayer: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock("@mantine/notifications", () => ({ showNotification: mocks.showNotification }));
vi.mock("@/components/tour-player/TourPlayer", () => ({
  TourPlayer: (props: Record<string, unknown>) => {
    mocks.tourPlayer(props);
    return <button onClick={props.onComplete as () => void}>Turu tamamla</button>;
  },
}));

import { TourRouteClient } from "./tour-route-client";

const manifest = { id: "tour-1", title: "Kış turu", nodes: [] } as unknown as TourManifest;

describe("tur route bağlamı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("kış yüzeyini oynatıcıya ve geri bağlantısına taşır", () => {
    render(
      <TourRouteClient
        manifest={manifest}
        hotelSlug="kar-zirvesi"
        hotelName="Kar Zirvesi"
        contextRoomSlug="dag-odasi"
        surface="kis"
      />,
    );

    expect(mocks.tourPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest,
        hotelName: "Kar Zirvesi",
        surface: "kis",
        contextRoomSlug: "dag-odasi",
        backHref: "/kis/oteller/kar-zirvesi",
        backLabel: "Kış oteline dön",
      }),
    );
  });

  it("yaz oda turunda oda geri bağlantısını korur", () => {
    render(
      <TourRouteClient
        manifest={manifest}
        hotelSlug="sahil-oteli"
        hotelName="Sahil Oteli"
        contextRoomSlug="deniz-odasi"
      />,
    );

    expect(mocks.tourPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "yaz",
        backHref: "/hotels/sahil-oteli/rooms/deniz-odasi",
        backLabel: "Oda sayfasına dön",
      }),
    );
  });

  it("tur tamamlanınca kullanıcıya bildirim verir", () => {
    render(
      <TourRouteClient
        manifest={manifest}
        hotelSlug="kar-zirvesi"
        hotelName="Kar Zirvesi"
        surface="kis"
      />,
    );

    screen.getByRole("button", { name: "Turu tamamla" }).click();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tur bitti", color: "teal" }),
    );
  });
});
