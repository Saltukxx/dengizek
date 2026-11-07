"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCalendar, IconMinus, IconPlus, IconUsers } from "@tabler/icons-react";
import { todayIso } from "@/lib/price";
import { MAX_ADULTS, MAX_CHILD_AGE, MAX_CHILDREN, describeParty, type StaySearch } from "@/lib/stay-search";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Yeni eklenen çocuğun varsayılan yaşı. */
const DEFAULT_CHILD_AGE = 6;

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="sf-stepper">
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="sf-stepper-controls">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${label} azalt`}>
          <IconMinus size={16} aria-hidden />
        </button>
        <output aria-live="polite" aria-label={label}>
          {value}
        </output>
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${label} artır`}>
          <IconPlus size={16} aria-hidden />
        </button>
      </span>
    </div>
  );
}

export interface StayFieldsProps {
  defaultValue: StaySearch;
  /** Verilirse her değişiklikte çağrılır (fiyat hesaplayıcı canlı günceller). */
  onChange?: (stay: StaySearch) => void;
  /**
   * true → alanlar GET formunda gönderilir (giris, cikis, yetiskin, cocuk).
   * Hesaplayıcıda form yoktur, adlar gereksizdir.
   */
  named?: boolean;
}

/**
 * Giriş/çıkış tarihi ve kişi seçimi. Kişi seçimi açılır bir panelde:
 * yetişkin ve çocuk sayısı, her çocuk için yaş (çocuk fiyatı yaşa bağlı).
 */
export function StayFields({ defaultValue, onChange, named = false }: StayFieldsProps) {
  const id = useId();
  const [checkIn, setCheckIn] = useState(defaultValue.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(defaultValue.checkOut ?? "");
  const [adults, setAdults] = useState(defaultValue.adults);
  const [childAges, setChildAges] = useState<number[]>(defaultValue.childAges);
  // İlk render'da sunucuyla aynı "bugün" — saat dilimi farkı hidrasyonu bozmasın.
  const [today] = useState(() => todayIso());
  const partyRef = useRef<HTMLDetailsElement>(null);

  const emit = (patch: Partial<StaySearch>) => {
    const next: StaySearch = {
      checkIn: checkIn || null,
      checkOut: checkOut || null,
      adults,
      childAges,
      hasParty: true,
      ...patch,
    };
    if (!next.checkIn || !next.checkOut || next.checkOut <= next.checkIn) {
      next.checkIn = null;
      next.checkOut = null;
    }
    onChange?.(next);
  };

  // Kişi paneli dışarı tıklanınca ya da Escape ile kapanır.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const el = partyRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && partyRef.current?.open) partyRef.current.open = false;
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const changeCheckIn = (value: string) => {
    setCheckIn(value);
    // Çıkış girişten önce kalırsa bir gece sonrasına kayar.
    let out = checkOut;
    if (value && (!out || out <= value)) {
      out = addDays(value, 1);
      setCheckOut(out);
    }
    emit({ checkIn: value || null, checkOut: out || null });
  };
  const changeCheckOut = (value: string) => {
    setCheckOut(value);
    emit({ checkOut: value || null });
  };
  const changeAdults = (value: number) => {
    setAdults(value);
    emit({ adults: value });
  };
  const changeChildren = (count: number) => {
    const next = count > childAges.length
      ? [...childAges, ...Array.from({ length: count - childAges.length }, () => DEFAULT_CHILD_AGE)]
      : childAges.slice(0, count);
    setChildAges(next);
    emit({ childAges: next });
  };
  const changeAge = (index: number, age: number) => {
    const next = childAges.map((a, i) => (i === index ? age : a));
    setChildAges(next);
    emit({ childAges: next });
  };

  return (
    <div className="sf">
      <label className="sf-field" htmlFor={`${id}-in`}>
        <span className="sf-label">
          <IconCalendar size={15} aria-hidden /> Giriş
        </span>
        <input
          id={`${id}-in`}
          type="date"
          className="sf-input"
          name={named && checkIn ? "giris" : undefined}
          value={checkIn}
          min={today}
          onChange={(e) => changeCheckIn(e.currentTarget.value)}
        />
      </label>
      <label className="sf-field" htmlFor={`${id}-out`}>
        <span className="sf-label">
          <IconCalendar size={15} aria-hidden /> Çıkış
        </span>
        <input
          id={`${id}-out`}
          type="date"
          className="sf-input"
          name={named && checkOut ? "cikis" : undefined}
          value={checkOut}
          min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
          onChange={(e) => changeCheckOut(e.currentTarget.value)}
        />
      </label>

      <details className="sf-field sf-party" ref={partyRef}>
        <summary>
          <span className="sf-label">
            <IconUsers size={15} aria-hidden /> Kişiler
          </span>
          <span className="sf-input sf-party-value">{describeParty({ adults, childAges })}</span>
        </summary>
        <div className="sf-party-panel">
          <Stepper label="Yetişkin" value={adults} min={1} max={MAX_ADULTS} onChange={changeAdults} />
          <Stepper
            label="Çocuk"
            hint={`0–${MAX_CHILD_AGE} yaş`}
            value={childAges.length}
            min={0}
            max={MAX_CHILDREN}
            onChange={changeChildren}
          />
          {childAges.length > 0 && (
            <div className="sf-ages">
              {childAges.map((age, i) => (
                <label key={i}>
                  <span>{i + 1}. çocuğun yaşı</span>
                  <select className="er-input" value={age} onChange={(e) => changeAge(i, Number(e.currentTarget.value))}>
                    {Array.from({ length: MAX_CHILD_AGE + 1 }, (_, a) => (
                      <option key={a} value={a}>
                        {a === 0 ? "1 yaşından küçük" : `${a} yaş`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <p>Çocuk ücreti yaşa göre hesaplanır.</p>
            </div>
          )}
          <button
            type="button"
            className="er-btn er-btn-primary er-btn-block"
            onClick={() => {
              if (partyRef.current) partyRef.current.open = false;
            }}
          >
            Tamam
          </button>
        </div>
      </details>

      {named ? (
        <>
          <input type="hidden" name="yetiskin" value={adults} />
          {childAges.length > 0 && <input type="hidden" name="cocuk" value={childAges.join(",")} />}
        </>
      ) : null}
    </div>
  );
}
