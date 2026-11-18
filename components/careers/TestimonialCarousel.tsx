"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CultureItem } from "@/lib/careers";

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function MainCard({ item, priority = false }: { item: CultureItem; priority?: boolean }) {
  return (
    <article className="culture-card culture-card--main">
      <Image src={item.image} alt={item.alt} fill sizes="(max-width: 767px) 86vw, 460px" priority={priority} />
      <div className="culture-card__overlay">
        <span className="eyebrow">{item.label}</span>
        <h3 className="culture-card__title">{item.title}</h3>
        <p className="culture-card__text">{item.text}</p>
      </div>
    </article>
  );
}

function SideCard({ item, onSelect }: { item: CultureItem; onSelect: () => void }) {
  return (
    <button type="button" className="culture-card culture-card--side" onClick={onSelect} aria-label={`Show ${item.title}`}>
      <span className="eyebrow culture-card__chip">{item.label}</span>
      <span className="culture-card__title">{item.title}</span>
      <span className="culture-card__text">{item.text}</span>
      <span className="culture-card__thumb">
        <Image src={item.image} alt="" width={320} height={64} sizes="320px" />
      </span>
    </button>
  );
}

/**
 * Desktop/tablet: three-up composition (side · featured · side) like the reference; dots and arrows rotate it.
 * Mobile: a swipeable scroll-snap track of every card; the dots follow the scroll position.
 */
export function TestimonialCarousel({ items }: { items: CultureItem[] }) {
  const n = items.length;
  const [index, setIndex] = useState(0);
  const isMobile = useIsMobile();
  const trackRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  // While a button-driven scroll is in flight, ignore scroll-position updates so the dots don't flicker.
  const lock = useRef<{ target: number; timer: number } | null>(null);

  const scrollToCard = useCallback((i: number) => {
    const track = trackRef.current;
    const card = track?.children[i] as HTMLElement | undefined;
    if (!track || !card) return;
    if (lock.current) window.clearTimeout(lock.current.timer);
    lock.current = { target: i, timer: window.setTimeout(() => (lock.current = null), 1200) };
    const delta =
      card.getBoundingClientRect().left - track.getBoundingClientRect().left - (track.clientWidth - card.clientWidth) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: track.scrollLeft + delta, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const go = useCallback(
    (i: number) => {
      const next = (i + n) % n;
      setIndex(next);
      if (isMobile) scrollToCard(next);
    },
    [n, isMobile, scrollToCard],
  );

  const onScroll = () => {
    if (!isMobile) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const tr = track.getBoundingClientRect();
      const center = tr.left + tr.width / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(track.children).forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (lock.current) {
        if (best !== lock.current.target) return;
        window.clearTimeout(lock.current.timer);
        lock.current = null;
      }
      setIndex(best);
    });
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      if (lock.current) window.clearTimeout(lock.current.timer);
    },
    [],
  );

  const prev = (index - 1 + n) % n;
  const next = (index + 1) % n;

  return (
    <div
      className="culture reveal"
      role="region"
      aria-roledescription="carousel"
      aria-label="Life at Qubenix"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(index - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(index + 1);
        }
      }}
    >
      <div className="culture__track" ref={trackRef} onScroll={onScroll}>
        {isMobile ? (
          items.map((item, i) => <MainCard key={item.title} item={item} priority={i === 0} />)
        ) : (
          <>
            <SideCard key={`p-${prev}`} item={items[prev]} onSelect={() => go(prev)} />
            <MainCard key={`m-${index}`} item={items[index]} />
            <SideCard key={`n-${next}`} item={items[next]} onSelect={() => go(next)} />
          </>
        )}
      </div>

      <div className="culture__controls">
        <button type="button" className="culture__arrow" aria-label="Previous" onClick={() => go(index - 1)}>
          <ChevronLeft className="icon" aria-hidden="true" />
        </button>
        <div className="culture__dots">
          {items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              className="culture__dot"
              aria-label={`Show ${item.title}`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button type="button" className="culture__arrow" aria-label="Next" onClick={() => go(index + 1)}>
          <ChevronRight className="icon" aria-hidden="true" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {index + 1} of {n}: {items[index].title}
      </p>
    </div>
  );
}
