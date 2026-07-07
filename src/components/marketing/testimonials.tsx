import React from 'react';
import { Star } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote: "Dati inaabot ako ng hatinggabi sa pag-lista ng benta. Ngayon, 5 minuto na lang! Wala nang nawawalang resibo, at nakakauwi na ako nang maaga.",
    name: 'Aling Rosa',
    business: 'Palengke Vendor',
    location: 'Divisoria, Manila',
    initials: 'AR',
    avatarBg: 'bg-primary/20',
    avatarText: 'text-primary',
    stars: 5,
  },
  {
    quote: "Ang laking tulong ng Utang Tracker! Dati nag-aaway pa kami ng mga suki ko dahil nawawala ang listahan. Ngayon, malinaw lahat sa Katuwang app.",
    name: 'Jun Macalintal',
    business: 'Sari-Sari Store Owner',
    location: 'Caloocan, Metro Manila',
    initials: 'JM',
    avatarBg: 'bg-secondary/30',
    avatarText: 'text-yellow-700',
    stars: 5,
  },
  {
    quote: "Kahit nasa byahe ako, namo-monitor ko yung hardware ko. Very convenient at madaling gamitin. Worth it talaga ang ₱99 kada buwan.",
    name: 'Mark Tolentino',
    business: 'Hardware Store Owner',
    location: 'Batangas City',
    initials: 'MT',
    avatarBg: 'bg-emerald-100',
    avatarText: 'text-emerald-700',
    stars: 5,
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 text-secondary fill-secondary" />
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="py-14 md:py-24 px-5 bg-white">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Mga Testimonyal</p>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Tiwala ng mga{' '}
            <span className="text-secondary">Pilipinong</span>{' '}
            Negosyante
          </h2>
          <p className="text-slate-500 text-sm md:text-lg">
            Huwag lang sa amin makinig. Pakinggan ang mga katulad mo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-6">
          {TESTIMONIALS.map(({ quote, name, business, location, initials, avatarBg, avatarText, stars }) => (
            <div
              key={name}
              className="bg-slate-50 border border-slate-100 p-6 rounded-2xl hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col gap-4"
            >
              {/* Stars */}
              <StarRating count={stars} />

              {/* Quote */}
              <p className="text-slate-700 text-sm leading-relaxed font-medium flex-1">
                "{quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
                <div className={`h-11 w-11 rounded-full ${avatarBg} flex items-center justify-center font-black ${avatarText} text-sm flex-shrink-0`}>
                  {initials}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm leading-tight">{name}</h4>
                  <p className="text-xs text-slate-500">{business}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
