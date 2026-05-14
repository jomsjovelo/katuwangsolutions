import React from 'react';
import { Quote } from 'lucide-react';

export function Testimonials() {
  return (
    <section className="py-20 md:py-32 px-6 bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Tiwala ng mga <span className="text-secondary">Pilipinong</span> Negosyante
          </h2>
          <p className="text-slate-500 text-lg">
            Huwag lang sa amin makinig. Pakinggan ang mga negosyanteng katulad mo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 relative border border-slate-100">
            <Quote className="h-10 w-10 text-primary/20 absolute top-8 right-8" />
            <div className="space-y-6">
              <p className="text-slate-700 italic leading-relaxed font-medium">
                "Dati 2 oras ang counting. Ngayon, 5 minuto na lang! Nakaka-uwi na ako ng maaga sa pamilya ko."
              </p>
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                  AR
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Aling Rosa</h4>
                  <p className="text-xs text-slate-500">Palengke Vendor</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 relative border border-slate-100">
            <Quote className="h-10 w-10 text-primary/20 absolute top-8 right-8" />
            <div className="space-y-6">
              <p className="text-slate-700 italic leading-relaxed font-medium">
                "Hindi na ako nawawalan ng kita dahil sa nawawalang resibo. Lahat nakalista na sa Benta Snap."
              </p>
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <div className="h-12 w-12 rounded-full bg-secondary/20 flex items-center justify-center font-bold text-yellow-700">
                  JM
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Jun Macalintal</h4>
                  <p className="text-xs text-slate-500">Sari-Sari Store Owner</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 relative border border-slate-100">
            <Quote className="h-10 w-10 text-primary/20 absolute top-8 right-8" />
            <div className="space-y-6">
              <p className="text-slate-700 italic leading-relaxed font-medium">
                "Kahit nasa byahe ako, namo-monitor ko yung hardware ko. Very convenient at daling gamitin."
              </p>
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
                  MT
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Mark Tolentino</h4>
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
