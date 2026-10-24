"""oteldenrezerve.com kategori sayfasındaki otelleri kazır: liste + detay + fotoğraflar.

Kullanım:
    python3 -I scripts/oteldenrezerve/scrape.py https://oteldenrezerve.com/termal-oteller <çıktı_klasörü> [--limit N]

Çıktı: <klasör>/oteller.json, images/<slug>/galeri|odalar/..., html/ (önbellek), hatalar.txt.
Ardından: npm run import:oteldenrezerve -- <klasör>   (Otelsayfam'a taslak olarak aktarır)

Notlar:
- Sayfalar arasında 1 sn, görseller arasında kısa bekleme vardır; tekrar
  çalıştırmada önbellekteki HTML ve inmiş görseller yeniden indirilmez.
- Oda listesi yalnız çevrimiçi satışa açık oteller için gelir; diğerlerinde
  oda bilgisi açıklama metnindedir.
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "Mozilla/5.0 (Macintosh) OtelsayfamImport/1.0"
PAGE_DELAY = 1.0


def fetch(url, binary=False, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(urllib.parse.quote(url, safe=":/?=&%#~"), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def strip(h):
    return re.sub(r"<script.*?</script>|<style.*?</style>|<svg.*?</svg>", "", h, flags=re.S)


def to_text(s):
    s = re.sub(r"<\s*(br|/p|/li|/div|/h\d|/tr)[^>]*>", "\n", s or "", flags=re.I)
    s = re.sub(r"<\s*li[^>]*>", "• ", s, flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in s.splitlines()]
    out = "\n".join(l for l in lines if l)
    return re.sub(r"•\s*\n", "• ", out)


def first(pattern, s, flags=re.S):
    m = re.search(pattern, s, flags)
    return m.group(1) if m else ""


def slugify(s):
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    s = s.translate(tr).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "oda"


def split_blocks(h, marker):
    parts = re.split(marker, h)
    return parts[1:]


def parse_hotel(h, url):
    h = strip(h)
    hotel = {
        "kaynak_url": url,
        "slug": url.rstrip("/").rsplit("/", 1)[-1],
        "ad": to_text(first(r'detailPageHeaderTop__title--name">(.*?)</div>', h)),
        "konum": to_text(first(r'detailPageHeaderTop__title--location">(.*?)</div>', h)),
        "belge_no": first(r"Belge No:\s*(\d+)", h),
    }

    # Galeri: ana görsel + rptMedia
    gallery, seen = [], set()
    for m in re.finditer(r'<a[^>]*data-fancybox="galeri"[^>]*>', h):
        tag = m.group(0)
        src = first(r'data-src="([^"]+)"', tag)
        if not src or src in seen or "/HotelImages/" not in src:
            continue
        seen.add(src)
        gallery.append({"url": html.unescape(src), "baslik": html.unescape(first(r'data-caption="([^"]*)"', tag))})
    hotel["galeri"] = gallery

    # Metin bölümleri (rptChecklist) ve olanak listeleri (rptChecklist2)
    sections = []
    for block in split_blocks(h, r'id="ContentPlaceHolder1_rptChecklist_dvChecklist_\d+"'):
        title = to_text(first(r'hotelDetail__item--title">(.*?)<(?:img|i)\b', block))
        body = first(r'hotelDetailFeaturesContent__item--text"\s*>(.*?)</div>\s*</div>', block)
        if title:
            sections.append({"baslik": title, "metin": to_text(body)})
    hotel["bolumler"] = sections

    features = []
    for block in split_blocks(h, r'id="ContentPlaceHolder1_rptChecklist2_dvChecklist_\d+"'):
        title = to_text(first(r'hotelDetail__item--title">(.*?)<(?:img|i)\b', block))
        items = [to_text(x) for x in re.findall(r"<li>(.*?)</li>", first(r'hotelDetailFeaturesList__item--list">(.*?)</ul>', block), re.S)]
        if title and items:
            features.append({"baslik": title, "ozellikler": [i for i in items if i]})
    hotel["olanaklar"] = features

    # Odalar: oda detay modalı (başlık, fotoğraflar, açıklama)
    rooms, seen_rooms = [], set()
    for block in split_blocks(h, r'<div class="popupModal" id='):
        name = to_text(first(r'roomDetailModal--title">(.*?)</div>', block))
        if not name or name in seen_rooms:
            continue
        seen_rooms.add(name)
        imgs = []
        for src in re.findall(r'roomDetailModalSlide__bg">\s*<img src="([^"]+)"', block):
            src = html.unescape(src)
            if src not in imgs:
                imgs.append(src)
        text = first(r'roomDetailModal__text">(.*?)</div>\s*</div>\s*</div>', block) or first(r'roomDetailModal__text">(.*)', block)[:20000]
        rooms.append({"ad": name, "slug": slugify(name), "aciklama": to_text(text)[:6000], "fotograflar": imgs})
    hotel["odalar"] = rooms
    return hotel


def parse_listing(h):
    """Kategori sayfasındaki otel kartları."""
    rows = []
    parts = re.split(r'<div id="ContentPlaceHolder1_rptHotelSearch_divHotelItem_\d+"', h)[1:]
    for c in parts:
        c = c.split('class="pagination', 1)[0]
        old = grab(c, r'priceArea--price"[^>]*>\s*<span>\s*([\d.,]+)\s*\w+\s*</span>')
        new = grab(c, r'priceArea--price"[^>]*>.*?<strong>\s*([\d.,]+)\s*\w*\s*</strong>')
        rows.append({
            "otel_adi": text(grab(c, r'head--title">\s*<a[^>]*>(.*?)</a>')),
            "il": text(grab(c, r'hrStateName_\d+">(.*?)</a>')),
            "ilce": text(grab(c, r'hrRegionName_\d+">(.*?)</a>')).lstrip("-").strip(),
            "bolge": text(grab(c, r'hrPlaceName_\d+">(.*?)</a>')).lstrip("-").strip(),
            "pansiyon": text(grab(c, r'<span class="default">(.*?)</span>')),
            "cocuk_notu": text(grab(c, r'<span class="child"><i></i>(.*?)</span>')),
            "kampanya": "; ".join(t for t in (text(x) for x in re.findall(r'<li\s+class="gift"[^>]*>(.*?)</li>', c, re.S)) if t and t != "Güvenli Online Alışveriş"),
            "indirim": text(grab(c, r'discount_btn[^>]*>\s*<strong>(.*?)</strong>')),
            "liste_fiyati_tl": old.replace(".", ""),
            "indirimli_fiyat_tl": new.replace(".", ""),
            "kaynak_url": grab(c, r'head--title">\s*<a href="([^"]+)"'),
        })

    return rows


def grab(chunk, pattern):
    m = re.search(pattern, chunk, re.S)
    return m.group(1) if m else ""


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def fetch_listing(category_url):
    """Kategori sayfalarını (?sayfa=N) boş sayfa gelene kadar gezer."""
    seen, rows = set(), []
    for n in range(1, 50):
        page = fetch(f"{category_url}?sayfa={n}")
        items = [r for r in parse_listing(page) if r["kaynak_url"] not in seen]
        if not items:
            break
        for r in items:
            seen.add(r["kaynak_url"])
        rows.extend(items)
        time.sleep(PAGE_DELAY)
    return rows


def ext_of(url):
    e = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    return e if e in (".jpg", ".jpeg", ".png", ".webp", ".gif") else ".jpg"


def download(job):
    url, path = job
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path, None
    try:
        data = fetch(url, binary=True)
        with open(path, "wb") as f:
            f.write(data)
        time.sleep(0.15)
        return path, None
    except Exception as e:  # noqa: BLE001
        return path, f"{url}: {e}"


def main():
    category_url, out = sys.argv[1].rstrip("/"), sys.argv[2]
    os.makedirs(out, exist_ok=True)
    listing = fetch_listing(category_url)
    json.dump(listing, open(f"{out}/liste.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Liste: {len(listing)} otel", flush=True)
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    os.makedirs(f"{out}/html", exist_ok=True)
    os.makedirs(f"{out}/images", exist_ok=True)
    hotels, errors = [], []

    for i, item in enumerate(listing[:limit] if limit else listing, 1):
        url = item["kaynak_url"]
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        cache = f"{out}/html/{slug}.html"
        try:
            if os.path.exists(cache):
                page = open(cache, encoding="utf-8").read()
            else:
                page = fetch(url)
                open(cache, "w", encoding="utf-8").write(page)
                time.sleep(PAGE_DELAY)
            hotel = parse_hotel(page, url)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{url}: {e}")
            print(f"[{i}] HATA {url}: {e}", flush=True)
            continue

        # liste sayfasındaki alanlar (il/ilçe, pansiyon, kampanya...) korunur
        hotel["liste"] = {k: v for k, v in item.items() if k != "kaynak_url"}

        jobs = []
        hdir = f"{out}/images/{slug}"
        os.makedirs(f"{hdir}/galeri", exist_ok=True)
        for n, g in enumerate(hotel["galeri"], 1):
            g["dosya"] = f"images/{slug}/galeri/{n:03d}{ext_of(g['url'])}"
            jobs.append((g["url"], f"{out}/{g['dosya']}"))
        for room in hotel["odalar"]:
            rdir = f"{hdir}/odalar/{room['slug']}"
            os.makedirs(rdir, exist_ok=True)
            files = []
            for n, src in enumerate(room["fotograflar"], 1):
                rel = f"images/{slug}/odalar/{room['slug']}/{n:02d}{ext_of(src)}"
                files.append({"url": src, "dosya": rel})
                jobs.append((src, f"{out}/{rel}"))
            room["fotograflar"] = files

        with ThreadPoolExecutor(max_workers=4) as pool:
            for path, err in pool.map(download, jobs):
                if err:
                    errors.append(err)
        hotels.append(hotel)
        print(
            f"[{i}/{len(listing)}] {hotel['ad']}: {len(hotel['galeri'])} galeri, {len(hotel['odalar'])} oda, "
            f"{len(hotel['bolumler'])} bölüm, {sum(len(f['ozellikler']) for f in hotel['olanaklar'])} olanak",
            flush=True,
        )
        json.dump(hotels, open(f"{out}/oteller.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    with open(f"{out}/hatalar.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(errors))
    print(f"BİTTİ: {len(hotels)} otel, {len(errors)} hata", flush=True)


if __name__ == "__main__":
    main()
