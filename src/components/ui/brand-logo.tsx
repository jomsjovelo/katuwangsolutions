import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  theme?: 'light' | 'dark'; // 'light' = dark text for light bg. 'dark' = white text for dark bg.
  showText?: boolean;
}

export function BrandLogo({ className, theme = 'light', showText = true }: BrandLogoProps) {
  const textColor = theme === 'light' ? 'text-[#0D1B4B]' : 'text-white';
  
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      {/* Official AI-Generated Branding Icon (Transparent) */}
      <div className="relative h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0">
        <Image 
          src="/katuwang-icon-transparent.png" 
          alt="Katuwang Icon" 
          fill 
          className="object-contain"
          priority
        />
      </div>
      
      {/* Wordmark (KATUWANG SOLUTIONS) */}
      {showText && (
        <div className="flex flex-col justify-center">
          <span className={cn("text-lg sm:text-xl font-black leading-none tracking-tight font-sans", textColor)}>
            KATUWANG
          </span>
          <span className={cn("text-[0.55rem] sm:text-[0.65rem] font-semibold leading-none tracking-[0.25em] font-sans mt-[2px] opacity-90", textColor)}>
            SOLUTIONS
          </span>
        </div>
      )}
    </div>
  );
}
