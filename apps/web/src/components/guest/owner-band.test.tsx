import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublishedHotelsForBrowse: vi.fn() }));
vi.mock("@/lib/hotels-repo", () => ({ getPublishedHotelsForBrowse: mocks.getPublishedHotelsForBrowse }));

import { OwnerBand } from "./owner-band";

const hotels = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ slug: `h${i}`, name: `Otel ${i}`, imageUrl: `/uploads/${i}.jpg` }));

describe("otel sahipleri bandı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tüm yayındaki otellerden gerçek sayı ve fotoğraf şeridi gösterir", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue(hotels(20));
    const { container } = render(await OwnerBand());

    expect(mocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(container.querySelectorAll(".ob-strip")).toHaveLength(2);
    // Kesintisiz döngü: her şerit fotoğrafları iki kez dizer (9 × 2).
    expect(container.querySelectorAll(".ob-strip")[0]!.querySelectorAll("img")).toHaveLength(18);
    expect(screen.getByRole("link", { name: /Otelinizi ekleyin/ })).toHaveAttribute("href", "/dashboard");
  });

  it("az fotoğraf varken şerit göstermez, başlık ve adımlar kalır", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue(hotels(2));
    const { container } = render(await OwnerBand());

    expect(container.querySelectorAll(".ob-strip")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Otelinizi video turla tanıtın" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
