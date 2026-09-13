import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hotelDetailPage: vi.fn(),
  generateHotelMetadata: vi.fn(),
}));

vi.mock("../../../hotels/[slug]/page", () => ({
  HotelDetailPage: (props: Record<string, unknown>) => {
    mocks.hotelDetailPage(props);
    return <div data-testid="winter-detail" />;
  },
  generateHotelMetadata: mocks.generateHotelMetadata,
}));

import WinterHotelPage, { generateMetadata } from "./page";

describe("kış otel detay route bağlantısı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ortak detay ekranını kış yüzeyiyle açar", async () => {
    const props = { params: Promise.resolve({ slug: "kar-zirvesi" }) };

    render(await WinterHotelPage(props));

    expect(screen.getByTestId("winter-detail")).toBeInTheDocument();
    expect(mocks.hotelDetailPage).toHaveBeenCalledWith(
      expect.objectContaining({ params: props.params, surface: "kis" }),
    );
  });

  it("metadata üretiminde de kış sezon korumasını geçirir", async () => {
    const props = { params: Promise.resolve({ slug: "kar-zirvesi" }) };
    mocks.generateHotelMetadata.mockResolvedValue({ title: "Kar Zirvesi" });

    await expect(generateMetadata(props)).resolves.toEqual({ title: "Kar Zirvesi" });
    expect(mocks.generateHotelMetadata).toHaveBeenCalledWith(props, "kis");
  });
});
