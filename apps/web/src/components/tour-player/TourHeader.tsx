import { Box, Group } from "@mantine/core";
import Link from "next/link";

type TourHeaderProps = {
  hotelName: string;
  hotelSlug: string;
  backHref: string;
};

export function TourHeader({ hotelName, hotelSlug, backHref }: TourHeaderProps) {
  return (
    <Box
      component="header"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 96,
        display: "flex",
        alignItems: "center",
        borderBottom: "0.5px solid rgba(212,175,55,0.28)",
        background: "rgba(8,9,10,0.9)",
        backdropFilter: "blur(18px)",
      }}
    >
      <Group justify="space-between" align="center" w="100%" px={80}>
        {/* Left nav */}
        <Group gap={36}>
          <Link
            href="/browse"
            style={{
              fontFamily: "var(--lux-font-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(208,197,178,0.72)",
              textDecoration: "none",
              transition: "color 200ms",
            }}
          >
            Keşfet
          </Link>
          <Link
            href={backHref}
            style={{
              fontFamily: "var(--lux-font-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--lux-gold)",
              textDecoration: "none",
              paddingBottom: 6,
              borderBottom: "1px solid var(--lux-gold)",
            }}
          >
            {hotelName}
          </Link>
          <Link
            href={`/inquiry?hotel=${hotelSlug}`}
            style={{
              fontFamily: "var(--lux-font-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(208,197,178,0.72)",
              textDecoration: "none",
              transition: "color 200ms",
            }}
          >
            Talep
          </Link>
        </Group>

        {/* Center brand */}
        <Link
          href={backHref}
          style={{
            fontFamily: "var(--lux-font-sans)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
            textDecoration: "none",
          }}
        >
          {hotelName.toUpperCase()}
        </Link>

        {/* Right — exit */}
        <Link
          href={backHref}
          style={{
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(208,197,178,0.72)",
            textDecoration: "none",
            paddingBottom: 2,
            borderBottom: "1px solid rgba(208,197,178,0.22)",
            transition: "color 200ms",
          }}
        >
          Çıkış
        </Link>
      </Group>
    </Box>
  );
}
