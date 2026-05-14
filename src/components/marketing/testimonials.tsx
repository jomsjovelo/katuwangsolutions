import React from 'react';
import { Quote } from 'lucide-react';

export function Testimonials() {
  return (
    <section className="py-12 md:py-24 px-4 sm:px-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-10 md:space-y-16">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Tiwala ng mga <span className="text-secondary">Pilipinong</span> Negosyante
          </h2>
          <p className="text-slate-500 text-sm md:text-lg">
            Huwag lang sa amin makinig. Pakinggan ang mga katulad mo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-8">
          <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-lg shadow-slate-100 relative border border-slate-100">
            <Quote className="h-8 w-8 text-primary/20 absolute top-5 right-5" />
            <div className="space-y-5">
              <p className="text-slate-700 italic leading-relaxed text-sm md:text-base font-medium">
                "Dati 2 oras ang counting. Ngayon, 5 minuto na lang! Nakaka-uwi na ako ng maaga sa pamilya ko."
              </p>
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">AR</div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Aling Rosa</h4>
                  <p className="text-xs text-slate-500">Palengke Vendor</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-lg shadow-slate-100 relative border border-slate-100">
            <Quote className="h-8 w-8 text-primary/20 absolute top-5 right-5" />
            <div className="space-y-5">
              <p className="text-slate-700 italic leading-relaxed text-sm md:text-base font-medium">
                "Hindi na ako nawawalan ng kita dahil sa nawawalang resibo. Lahat nakalista na sa Benta Snap."
              </p>
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center font-bold text-yellow-700 text-sm flex-shrink-0">JM</div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Jun Macalintal</h4>
                  <p className="text-xs text-slate-500">Sari-Sari Store Owner</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-lg shadow-slate-100 relative border border-slate-100">
            <Quote className="h-8 w-8 text-primary/20 absolute top-5 right-5" />
            <div className="space-y-5">
              <p className="text-slate-700 italic leading-relaxed text-sm md:text-base font-medium">
                "Kahit nasa byahe ako, namo-monitor ko yung hardware ko. Very convenient at madaling gamitin."
              </p>
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700 text-sm flex-shrink-0">MT</div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Mark Tolentino</h4>
                  <p className="text-xs text-slate-500">Hardware Owner</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
