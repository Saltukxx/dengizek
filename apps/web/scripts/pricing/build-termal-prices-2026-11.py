"""
Otelden Rezerve'nin 4 Kasım 2026'da gönderdiği acente fiyat listelerinden
(otel-fiyatlari/otel-fiyatlari-2026-11-04.md) panel API'sinin beklediği dönem
fiyatlarını üretir. Misafire LİSTEDEKİ BRÜT fiyat gösterilir (Lycus yalnız net
verdiği için net + %15). Tutarlar TL; çıktı en küçük birimde (kuruş).

Kurallar:
- PP (kişi başı) fiyat → oda fiyatı: 2 kişi = 2×PP; 1 ve 3 kişi kişi fiyatı
  olarak (occupancyPrices) yazılır. Ünite fiyatlı odalar (suite) sabit.
- Akrones'te Cuma ve Cumartesi geceleri ayrı (hafta sonu) dönemdir.
- Çocuk: fiyat motoru çocuğu yaşına göre ücretlendirir; bandın dışında kalan
  çocuk oda fiyatından ücretlendirildiği için 0-17 yaş her odada kapsanır.
  "1. çocuk ücretsiz, 2. çocuk %50" kuralları yaş bandına çevrilemez: ilk
  çocuk kuralı uygulanır (otel talepte teyit eder).
- Geçmiş tarihler yazılmaz (bugün: 2026-11-04).
"""
import json, datetime as dt, sys

TODAY = dt.date.today()
D = dt.date.fromisoformat

def tl(x): return int(round(x * 100))

def nights(a, b):
    d = D(a)
    while d <= D(b):
        yield d
        d += dt.timedelta(days=1)

def split_weekend(start, end, wd_name, we_name):
    """[start,end] gecelerini hafta içi / Cuma-Cumartesi parçalarına böler."""
    segs = []
    for d in nights(start, end):
        kind = "we" if d.weekday() in (4, 5) else "wd"
        if segs and segs[-1][0] == kind and segs[-1][2] == d - dt.timedelta(days=1):
            segs[-1][2] = d
        else:
            segs.append([kind, d, d])
    return [(we_name if k == "we" else wd_name, k, a.isoformat(), b.isoformat()) for k, a, b in segs]

def rate(name, start, end, room_price, occ=None, kids=None, weekdays=None, stay_min=None, stay_max=None):
    """Dönem; weekdays (0 Pazar … 6 Cumartesi) ve konaklama süresi koşulu
    verilirse aynı tarihteki ana dönemin üstüne yazar."""
    if D(end) < TODAY: return None
    start = max(D(start), TODAY).isoformat()
    r = {"name": name, "startDate": start, "endDate": end, "priceMinor": tl(room_price), "currency": "TRY",
         "occupancyPrices": [{"guestCount": g, "priceMinor": tl(p)} for g, p in sorted((occ or {}).items())],
         "childAgePrices": kids or [],
         "weekdays": weekdays, "stayMinNights": stay_min, "stayMaxNights": stay_max}
    return r

def free(a, b, order=None): return {"ageFrom": a, "ageTo": b, "mode": "ucretsiz", "childOrder": order}
def fixed(a, b, price, order=None): return {"ageFrom": a, "ageTo": b, "mode": "sabit", "priceMinor": tl(price), "childOrder": order}
FRI_SAT = [5, 6]

def stay_pay(name, start, end, tiers, rule, bookable_to=None):
    return {"name": name, "discountPercent": None, "stayPayTiers": [{"stay": a, "pay": b} for a, b in tiers],
            "freeNightRule": rule, "validFrom": max(D(start), TODAY).isoformat(), "validTo": end, "minNights": None,
            "bookableTo": bookable_to}

spec = {}

# ── 1. Akrones ─────────────────────────────────────────────────────────────
ak = {  # oda: dönem → (tek kişi, PP2, PP3)  ya da ("unit", fiyat)
    "deluxe-oda":          {"A": [(12300, 8200, None), (12900, 8600, None)], "B": (13200, 8800, None), "C": [(14250, 9500, None), (15000, 10000, None)], "D": (17250, 11500, None)},
    "deluxe-superior-oda": {"A": [(12750, 8500, 7650), (13500, 9000, 8100)], "B": (14250, 9500, 8550), "C": [(15000, 10000, 9000), (15750, 10500, 9450)], "D": (18000, 12000, 10800)},
    "corner-suite-oda":    {"A": [(15750, 10500, None), (17250, 11500, None)], "B": (17250, 11500, None), "C": [(18525, 12350, None), (19500, 13000, None)], "D": (22500, 15000, None)},
    "family-suite-oda":    {"A": [("unit", 32800), ("unit", 34400)], "B": ("unit", 35200), "C": [("unit", 38000), ("unit", 40000)], "D": ("unit", 46000)},
    "honeymoon-suite-oda": {"A": [("unit", 29000), ("unit", 31000)], "B": ("unit", 32000), "C": [("unit", 34000), ("unit", 36000)], "D": ("unit", 41000)},
}
def ak_rate(name, a, b, t, weekdays=None):
    if t[0] == "unit":
        return rate(name, a, b, t[1], kids=[free(0, 17)], weekdays=weekdays)
    single, pp2, pp3 = t
    occ = {1: single, 2: 2 * pp2}
    if pp3: occ[3] = 3 * pp3
    # 0-1 bebek ücretsiz; 2-5 yaş 1. çocuk ücretsiz, 2. çocuk kişi başının
    # yarısı; 6-11 yaş kişi başının yarısı; 12+ yetişkin (3. kişi).
    kids = [free(0, 1), free(2, 5, 1), fixed(2, 5, pp2 / 2, 2), fixed(6, 11, pp2 / 2), fixed(12, 17, pp3 or pp2)]
    return rate(name, a, b, 2 * pp2, occ, kids, weekdays=weekdays)
spec["akrones-termal-hotel"] = {}
for room, p in ak.items():
    rs = []
    for (a, b) in [("2026-10-23", "2026-11-13"), ("2026-11-22", "2026-12-30")]:
        rs.append(ak_rate("Sonbahar", a, b, p["A"][0]))
        rs.append(ak_rate("Sonbahar · Cuma-Cumartesi", a, b, p["A"][1], FRI_SAT))
    rs.append(ak_rate("Kasım ara tatili", "2026-11-14", "2026-11-21", p["B"]))
    rs.append(ak_rate("Ocak", "2027-01-03", "2027-01-22", p["C"][0]))
    rs.append(ak_rate("Ocak · Cuma-Cumartesi", "2027-01-03", "2027-01-22", p["C"][1], FRI_SAT))
    rs.append(ak_rate("Sömestr", "2027-01-23", "2027-02-06", p["D"]))
    spec["akrones-termal-hotel"][room] = [r for r in rs if r]
AK_TIERS = [(4, 3), (5, 4), (6, 5), (7, 6), (8, 6)]
akrones_promotions = [
    stay_pay("Çok kal az öde", "2026-10-23", "2026-11-13", AK_TIERS, "hafta_ici"),
    stay_pay("Çok kal az öde", "2026-11-22", "2026-12-30", AK_TIERS, "hafta_ici"),
    stay_pay("Çok kal az öde", "2027-01-03", "2027-01-22", AK_TIERS, "hafta_ici"),
]

# ── 2. Lycus River (net + %15) ─────────────────────────────────────────────
G = lambda net: round(net * 1.15)
def ly(name, a, b, s1, s2, s3, stay_min=None):
    g1, g2, g3 = G(s1), G(s2), G(s3)
    # 0-6 yaş 1. çocuk ücretsiz; aynı yaş 2. çocuk ve 7-12 yaş kişi başının yarısı.
    kids = [free(0, 6, 1), fixed(0, 6, g2 / 4, 2), fixed(7, 12, g2 / 4), fixed(13, 17, g3 - g2)]
    return rate(name, a, b, g2, {1: g1, 2: g2, 3: g3}, kids, stay_min=stay_min)
LY = [("Kış dönemi", "2026-09-22", "2026-11-12", "N"), ("Kasım ara tatili", "2026-11-13", "2026-11-22", "S"),
      ("Kış dönemi", "2026-11-23", "2027-01-21", "N"), ("Sömestr", "2027-01-22", "2027-02-07", "S"),
      ("Kış dönemi", "2027-02-08", "2027-02-28", "N")]
LY_P = {"N": ((4425, 5900, 7965), (4050, 5400, 7290)), "S": ((5250, 7000, 9600), (4500, 6000, 8250))}
spec["lycus-river-termal-hotel"] = {"standart-oda": [r for r in (
    x for n, a, b, k in LY for x in (ly(n, a, b, *LY_P[k][0]), ly(f"{n} · en az 3 gece", a, b, *LY_P[k][1], stay_min=3))
) if r]}

# ── 3. Wyndham (brüt) ──────────────────────────────────────────────────────
def wy_pp(name, a, b, pp, single_mult=1.5, second_child_half=True):
    occ = {1: pp * single_mult, 2: 2 * pp, 3: 2 * pp + 0.7 * pp}
    # 0-2 her çocuk ücretsiz; 3-11 1. çocuk ücretsiz; Deluxe/Corner'da aynı
    # yaş 2. çocuk %50, Standart'ta 3. kişi (%30 indirimli) gibi.
    second = pp / 2 if second_child_half else 0.7 * pp
    return rate(name, a, b, 2 * pp, occ, [free(0, 2), free(3, 11, 1), fixed(3, 11, second, 2), fixed(12, 17, 0.7 * pp)])
def wy_unit(name, a, b, price): return rate(name, a, b, price, kids=[free(0, 11), fixed(12, 17, price * 0.35 * 0.7)])
W = [("Kış dönemi", "2026-10-29", "2026-11-13", "A"), ("Kasım ara tatili", "2026-11-14", "2026-11-21", "B"), ("Kış dönemi", "2026-11-22", "2026-12-30", "A")]
wp = {"standart-oda": (8150, 9000, 1.5, False), "deluxe-oda": (8900, 9750, 1.5, True), "corner-deluxe-oda": (9650, 10500, 2.0, True)}
wu = {"executive-suite-oda": (21800, 23500), "executive-suite-jetted-tub": (24300, 26000)}
spec["wyndham-afyonkarahisar-thermal-spa"] = {}
for room, (a_, b_, sm, half) in wp.items():
    spec["wyndham-afyonkarahisar-thermal-spa"][room] = [r for r in (wy_pp(n, s, e, a_ if k == "A" else b_, sm, half) for n, s, e, k in W) if r]
for room, (a_, b_) in wu.items():
    spec["wyndham-afyonkarahisar-thermal-spa"][room] = [r for r in (wy_unit(n, s, e, a_ if k == "A" else b_) for n, s, e, k in W) if r]

# ── 4. Lidya Sardes ────────────────────────────────────────────────────────
def li(name, a, b, pp, min3=False):
    if min3:  # Dubleks bahçe 2+1: en az 3 tam kişi
        return rate(name, a, b, 3 * pp, {4: 4 * pp, 5: 5 * pp}, [free(0, 6), fixed(7, 12, pp / 2), fixed(13, 17, pp)])
    return rate(name, a, b, 2 * pp, {1: 1.5 * pp, 2: 2 * pp, 3: 3 * pp}, [free(0, 6), fixed(7, 12, pp / 2), fixed(13, 17, pp)])
L = [  # (ad, başlangıç, bitiş, standart PP, corner PP)
    ("Sonbahar", "2026-11-01", "2026-11-13", 4250, 5000),
    ("Kasım ara tatili", "2026-11-14", "2026-11-21", 5250, 6000),
    ("Sonbahar", "2026-11-22", "2026-12-29", 4250, 5000),
    ("2027", "2027-01-03", "2027-01-22", 4650, 5500),
    ("Sömestr", "2027-01-23", "2027-02-06", 5800, 6600),
    ("2027", "2027-02-07", "2027-03-05", 4650, 5500),
    ("Mart özel dönemi", "2027-03-06", "2027-03-13", 5800, 6600),
    ("2027", "2027-03-14", "2027-05-14", 4650, 5500),
    ("Mayıs özel dönemi", "2027-05-15", "2027-05-22", 5800, 6600),
    ("2027", "2027-05-23", "2027-10-31", 4650, 5500),
]
# Normal dönemlerde Cumartesi gecesi TEK GECELİK konaklama ayrı fiyatlıdır
# (çok geceli konaklamada Cumartesi normal fiyattan).
SAT_SINGLE = {"Sonbahar": (5250, 6000), "2027": (5800, 6600)}
def li_room(kind):
    out = []
    for n, a, b, s_, c_ in L:
        pp = c_ if kind == "corner" else s_
        out.append(li(n, a, b, pp, kind == "dubleks"))
        if n in SAT_SINGLE:
            sat = SAT_SINGLE[n][1 if kind == "corner" else 0]
            r = li(f"{n} · Cumartesi tek gece", a, b, sat, kind == "dubleks")
            if r: r.update({"weekdays": [6], "stayMaxNights": 1}); out.append(r)
    return [r for r in out if r]
spec["lidya-sardes-hotel-termal-spa"] = {
    "ana-bina-standart-oda": li_room("standart"),
    "bahce-standart-oda": li_room("standart"),
    "dublex-bahce-oda-2-1": li_room("dubleks"),
    "ana-bina-corner-oda": li_room("corner"),
}
LI_TIERS = [(5, 4), (7, 5)]
# Son rezervasyon tarihleri e-postadaki özel aksiyondan.
lidya_promotions = [stay_pay("Özel dönem · çok kal az öde", a, b, LI_TIERS, "en_ucuz", last) for a, b, last in
                    [("2026-11-14", "2026-11-21", "2026-11-21"), ("2027-01-23", "2027-02-06", "2027-02-06"),
                     ("2027-03-06", "2027-03-13", "2027-03-13"), ("2027-05-15", "2027-05-22", "2027-05-19")]]

# ── 5. Ağaoğlu My Termal ───────────────────────────────────────────────────
def ag(pp, single_mult):
    return [r for r in [rate("Kasım ara tatili", "2026-11-14", "2026-11-23", 2 * pp, {1: single_mult * pp, 2: 2 * pp, 3: 3 * pp},
                             [free(0, 8, 1), fixed(0, 8, pp / 2, 2), fixed(9, 12, pp / 2), fixed(13, 17, pp)])] if r]
spec["agaoglu-my-termal-hotel"] = {"standart-otel-odasi": ag(3750, 1.5), "1-0-villa": ag(3750, 2), "1-1-villa": ag(3750, 2), "garden-oda": ag(4000, 2)}

# ── 6. Orkis Palace (oda başı) ─────────────────────────────────────────────
O = [("Sonbahar", "2026-06-26", "2026-11-13"), ("Sonbahar", "2026-11-23", "2026-12-29")]  # ara tatil ve yılbaşı kapsam dışı
spec["orkis-palace-thermal-spa"] = {
    "standart-oda": [r for r in (rate(n, a, b, 8500, {1: 6000, 2: 8500, 3: 11000}, [fixed(0, 17, 2500)]) for n, a, b in O) if r],
    "family-suite-oda": [r for r in (rate(n, a, b, 19000, kids=[free(0, 17)]) for n, a, b in O) if r],
    "corner-senior-suite": [r for r in (rate(n, a, b, 17000, kids=[free(0, 17)]) for n, a, b in O) if r],
}

# ── 7. BİGTermal (Big Thermal Spa Resort) ──────────────────────────────────
B = [("Sonbahar", "2026-11-01", "2026-11-13", 1.0), ("Kasım ara tatili", "2026-11-14", "2026-11-22", 1.2), ("Sonbahar", "2026-11-23", "2026-12-29", 1.0)]
spec["big-thermal-spa-resort"] = {
    "standart-oda": [r for r in (rate(n, a, b, 10000 * m, {1: 7500 * m, 2: 10000 * m, 3: 13500 * m},
                                      [free(0, 1), free(2, 11, 1), fixed(2, 11, 2500 * m, 2), fixed(12, 17, 3500 * m)]) for n, a, b, m in B) if r],
    "aile-odasi": [r for r in (rate(n, a, b, 17500 * m, {4: 18500 * m, 5: 22500 * m}, [free(0, 1), fixed(2, 17, 1000 * m)]) for n, a, b, m in B) if r],
    "deluxe-suite": [r for r in (rate(n, a, b, 17500 * m, kids=[free(0, 17)]) for n, a, b, m in B) if r],
    "king-suite": [r for r in (rate(n, a, b, 40000 * m, kids=[free(0, 17)]) for n, a, b, m in B) if r],
}

# ── 8. Oruçoğlu ────────────────────────────────────────────────────────────
def oc(single, pp2, third, child):
    return [r for r in [rate("Sömestr", "2027-01-23", "2027-02-05", 2 * pp2, {1: single, 2: 2 * pp2, 3: 2 * pp2 + third},
                             [free(0, 6), fixed(7, 12, child), fixed(13, 17, third)])] if r]
def oc_suite():
    return [r for r in [rate("Sömestr", "2027-01-23", "2027-02-05", 28400, {3: 38340}, [free(0, 6), fixed(7, 12, 7100), fixed(13, 17, 9940)])] if r]
spec["orucoglu-thermal-hotel"] = {
    "standart-balkonsuz-kuvetli-oda": oc(14875, 8750, 6125, 4375),
    "standart-balkonsuz-dusakabinli-oda": oc(15045, 8850, 6195, 4425),
    "aile-odasi": oc_suite(),
    "kose-suit": oc_suite(),
}

# Listelenen otellerin kampanyaları bu listeyle DEĞİŞTİRİLİR (boş liste → kampanyasız).
out = {"hotels": spec, "promotions": {
    "akrones-termal-hotel": akrones_promotions,
    "lidya-sardes-hotel-termal-spa": lidya_promotions,
    "lycus-river-termal-hotel": [],
}}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
