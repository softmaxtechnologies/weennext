"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "./Icons";
import { slugify } from "@/lib/utils";

const heroSlides = [
  { bg: "from-[#0E3F7A] to-[#1975B1]", title: "Shop Smarter", sub: "Premium products at honest prices", emoji: "🛒" },
  { bg: "from-[#1975B1] to-[#0E3F7A]", title: "New Arrivals", sub: "Fresh picks every week", emoji: "✨" },
  { bg: "from-[#E4BF1A] to-[#d4af10]", title: "Fast Delivery", sub: "Right to your doorstep", emoji: "🚀" },
];

// Static brand banner — auto-plays every 5s
export const BrandHeroSlider = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setCurrentSlide((s) => (s + 1) % heroSlides.length), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative rounded-3xl overflow-hidden mb-6 h-52 md:h-72 shadow-lg">
      {heroSlides.map((slide, idx) => (
        <div key={idx} className={`absolute inset-0 bg-gradient-to-br ${slide.bg} flex items-center transition-opacity duration-700 ${currentSlide === idx ? "opacity-100" : "opacity-0"}`}>
          <div className="px-10 text-white">
            <p className="text-5xl mb-4">{slide.emoji}</p>
            <h2 className="text-3xl md:text-5xl font-black leading-none mb-2">{slide.title}</h2>
            <p className="text-white/70 text-base md:text-lg">{slide.sub}</p>
          </div>
        </div>
      ))}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {heroSlides.map((_, i) => (
          <button key={i} onClick={() => setCurrentSlide(i)} className={`h-1.5 rounded-full transition-all ${currentSlide === i ? "bg-white w-6" : "bg-white/40 w-1.5"}`} />
        ))}
      </div>
    </div>
  );
};

// Live product carousel pulled straight from Firestore — auto-plays, links to SEO product pages
export const ProductHeroSlider = ({ products }) => {
  const [current, setCurrent] = useState(0);
  const slides = (products || []).filter((p) => p.imageBase64).slice(0, 6);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="relative w-full rounded-3xl overflow-hidden shadow-lg mb-6 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1]" style={{ aspectRatio: "16/6", minHeight: 180 }}>
      {slides.map((p, idx) => (
        <Link
          key={p.id}
          href={`/products/${slugify(p.name)}`}
          className={`absolute inset-0 flex items-center transition-opacity duration-700 ${current === idx ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        >
          <div className="flex items-center gap-6 px-6 md:px-12 w-full">
            <div className="hidden sm:flex w-32 h-32 md:w-44 md:h-44 bg-white rounded-2xl shadow-xl items-center justify-center flex-shrink-0 overflow-hidden">
              <img src={`data:image/jpeg;base64,${p.imageBase64}`} alt={p.name} className="w-full h-full object-contain p-2" />
            </div>
            <div className="text-white">
              <span className="inline-block bg-white/20 text-xs px-2.5 py-1 rounded-full mb-2 font-semibold">{p.category}</span>
              <h3 className="text-xl md:text-3xl font-black leading-tight max-w-md line-clamp-2">{p.name}</h3>
              <p className="text-2xl md:text-3xl font-extrabold text-[#E4BF1A] mt-2">₹{p.price?.toLocaleString()}</p>
              <span className="inline-block mt-3 bg-white text-[#0E3F7A] text-sm font-bold px-4 py-2 rounded-xl">View Product →</span>
            </div>
          </div>
        </Link>
      ))}
      {slides.length > 1 && (
        <>
          <button onClick={() => setCurrent((c) => (c - 1 + slides.length) % slides.length)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 transition z-10">
            <Icon.ChevronLeft />
          </button>
          <button onClick={() => setCurrent((c) => (c + 1) % slides.length)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 transition z-10">
            <Icon.ChevronRight />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${current === i ? "bg-white w-5" : "bg-white/50 w-1.5"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Ad banner slider (admin-configured slides from Firestore `adSlides` collection)
export const AdBannerSlider = ({ slides }) => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-md" style={{ aspectRatio: "3/1", minHeight: 100 }}>
      {slides.map((slide, idx) => (
        <div key={idx} className={`absolute inset-0 transition-opacity duration-700 ${current === idx ? "opacity-100" : "opacity-0"}`}>
          {slide.imageBase64 ? (
            <img src={`data:image/jpeg;base64,${slide.imageBase64}`} alt={slide.title || "Ad"} className="w-full h-full object-cover" />
          ) : slide.imageUrl ? (
            <img src={slide.imageUrl} alt={slide.title || "Ad"} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${slide.bg || "from-[#0E3F7A] to-[#1975B1]"} flex items-center justify-center`}>
              <div className="text-white text-center px-6">
                {slide.emoji && <p className="text-4xl mb-2">{slide.emoji}</p>}
                <p className="text-xl font-black">{slide.title}</p>
                {slide.sub && <p className="text-white/70 text-sm mt-1">{slide.sub}</p>}
              </div>
            </div>
          )}
        </div>
      ))}
      {slides.length > 1 && (
        <>
          <button onClick={() => setCurrent((c) => (c - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10">
            <Icon.ChevronLeft />
          </button>
          <button onClick={() => setCurrent((c) => (c + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10">
            <Icon.ChevronRight />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${current === i ? "bg-white w-5" : "bg-white/50 w-1.5"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
