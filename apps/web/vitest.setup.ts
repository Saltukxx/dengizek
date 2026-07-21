import "@testing-library/jest-dom/vitest";

// jsdom window.matchMedia'yı desteklemiyor; Mantine (renk şeması, breakpoint
// hook'ları) buna ihtiyaç duyuyor. Bileşen testleri bu polyfill olmadan
// MantineProvider mount ederken patlar.
// jsdom ResizeObserver'ı da implemente etmiyor — Mantine ScrollArea vb.
// bileşenler buna ihtiyaç duyuyor.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom Element.scrollTo/scrollIntoView'ı da implemente etmiyor — otomatik
// kaydırma yapan bileşenler (ör. sohbet panelleri) mount'ta patlamasın diye.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
