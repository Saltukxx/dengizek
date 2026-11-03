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

  it("kartı otel adıyla tek bağlantı yapar ve özel yüzey adresini korur", () => {
    render(<HotelCard hotel={hotel} href="/kis/oteller/kar-zirvesi" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Kar Zirvesi" })).toHaveAttribute("href", "/kis/oteller/kar-zirvesi");
  });

  it("video tur rozetini yalnız turu olan tesiste gösterir", () => {
    const { rerender } = render(<HotelCard hotel={hotel} />);
    expect(screen.queryByText("Video tur")).not.toBeInTheDocument();

    rerender(<HotelCard hotel={hotel} hasTour />);
    expect(screen.getByText("Video tur")).toBeInTheDocument();
  });

  it("sayısal olmayan fiyat etiketini gece ücreti gibi göstermez", () => {
    render(<HotelCard hotel={hotel} />);

    expect(screen.getByText("Fiyat talep üzerine")).toBeInTheDocument();
    expect(screen.queryByText("Talep üzerine")).not.toBeInTheDocument();
    expect(screen.queryByText("gecelik başlayan")).not.toBeInTheDocument();
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
        amenities={["Televizyon", "sauna", "Termal Havuz", "Türk Hamamı", "kapali-havuz"]}
      />,
    );

    expect(screen.getByTitle("18 yorum")).toHaveTextContent("4,75");
    expect(screen.getByText("Bursa · 5 yıldızlı")).toBeInTheDocument();
    // Serbest metin olanaklar anahtara çevrilir; öncelikli ilk üçü tek satırda.
    expect(screen.getByText("Termal havuz · Hamam · Kapalı havuz")).toBeInTheDocument();
    expect(screen.queryByText(/Televizyon/)).not.toBeInTheDocument();
  });

  it("fiyat ve görsel yoksa kırık medya üretmeden talep yönlendirmesi gösterir", () => {
    render(<HotelCard hotel={{ ...hotel, imageUrl: "", priceLabel: undefined }} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Fiyat talep üzerine")).toBeInTheDocument();
  });
});
