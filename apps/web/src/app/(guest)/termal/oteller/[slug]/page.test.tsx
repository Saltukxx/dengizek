import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hotelDetailPage: vi.fn(),
  generateHotelMetadata: vi.fn(),
}));

vi.mock("@/components/guest/hotel-detail-page", () => ({
  HotelDetailPage: (props: Record<string, unknown>) => {
    mocks.hotelDetailPage(props);
    return <div data-testid="thermal-detail" />;
  },
  generateHotelMetadata: mocks.generateHotelMetadata,
}));

import ThermalHotelPage, { generateMetadata } from "./page";

describe("termal otel detay route bağlantısı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ortak detay ekranını termal yüzeyiyle açar", async () => {
    const props = { params: Promise.resolve({ slug: "akrones-termal-hotel" }) };

    render(await ThermalHotelPage(props));

    expect(screen.getByTestId("thermal-detail")).toBeInTheDocument();
    expect(mocks.hotelDetailPage).toHaveBeenCalledWith(
      expect.objectContaining({ params: props.params, surface: "termal" }),
    );
  });

  it("metadata üretiminde de termal sezon korumasını geçirir", async () => {
    const props = { params: Promise.resolve({ slug: "akrones-termal-hotel" }) };
    mocks.generateHotelMetadata.mockResolvedValue({ title: "Akrones Termal" });

    await expect(generateMetadata(props)).resolves.toEqual({ title: "Akrones Termal" });
    expect(mocks.generateHotelMetadata).toHaveBeenCalledWith(props, "termal");
  });
});
