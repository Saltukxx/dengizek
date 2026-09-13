import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={imageProps.alt ?? ""} {...imageProps} />;
  },
}));

import { HotelCard } from "./hotel-card";

const hotel = {
  slug: "kar-zirvesi",
  name: "Kar Zirvesi",
  city: "Bursa",
  country: "Türkiye",
  shortDescription: "Piste komşu dağ oteli.",
  longDescription: "",
  imageUrl: "https://cdn.test/kar.jpg",
  priceLabel: "Talep üzerine",
  roomTypes: [],
};

describe("HotelCard", () => {
  afterEach(() => cleanup());

  it("özel yüzey bağlantısını kartın bütün eylemlerinde korur", () => {
    render(<HotelCard hotel={hotel} href="/kis/oteller/kar-zirvesi" actionLabel="Tesisi İncele" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.getAttribute("href") === "/kis/oteller/kar-zirvesi")).toBe(true);
    expect(screen.getByRole("link", { name: "Tesisi İncele" })).toBeInTheDocument();
  });

  it("sayısal fiyatı eski metin etiketine tercih eder ve gecelik bağlamını gösterir", () => {
    render(<HotelCard hotel={hotel} minPriceMinor={1_250_000} currency="TRY" />);

    expect(screen.getByText(/12\.500/)).toBeInTheDocument();
    expect(screen.queryByText("Talep üzerine")).not.toBeInTheDocument();
    expect(screen.getByText("gecelik başlayan")).toBeInTheDocument();
  });

  it("yorum, yıldız ve olanakları yalnız anlamlı veri olduğunda gösterir", () => {
    render(
      <HotelCard
        hotel={hotel}
        reviewAverage={4.75}
        reviewCount={18}
        starRating={5}
        amenities={["spa-merkezi", "kapali-havuz", "sauna"]}
      />,
    );

    expect(screen.getByTitle("18 yorum")).toHaveTextContent("4,75");
    expect(screen.getByText("5 Yıldız")).toBeInTheDocument();
    expect(screen.getByText("Spa merkezi")).toBeInTheDocument();
    expect(screen.getByText("Kapalı havuz")).toBeInTheDocument();
    expect(screen.queryByText("Sauna")).not.toBeInTheDocument();
  });

  it("fiyat ve görsel yoksa kırık medya üretmeden talep yönlendirmesi gösterir", () => {
    render(<HotelCard hotel={{ ...hotel, imageUrl: "", priceLabel: undefined }} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Fiyat için talep gönderin")).toBeInTheDocument();
  });
});
