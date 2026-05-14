"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { format, addDays, startOfToday, isSameDay } from "date-fns"
import { cn } from "@/lib/utils"

interface SnapDateProps {
  date: Date;
  onSelect: (date: Date) => void;
  className?: string;
}

export function SnapDate({ date, onSelect, className }: SnapDateProps) {
  const [month, setMonth] = React.useState<Date | null>(null);
  const [today, setToday] = React.useState<Date | null>(null);
  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    setMonth(new Date());
    setToday(startOfToday());
    setMounted(true);
  }, []);

  if (!mounted || !month || !today) return (
    <div className="w-full h-64 bg-secondary/10 rounded-2xl animate-pulse flex items-center justify-center">
      <span className="text-xs text-muted-foreground font-black uppercase tracking-widest">Loading Calendar...</span>
    </div>
  );

  const quickChips = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
    { label: 'Last 7 Days', value: addDays(today, -7) },
  ];

  const daysInView = Array.from({ length: 35 }).map((_, i) => addDays(month, i - 15));

  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {quickChips.map((chip) => (
          <Button
            key={chip.label}
            variant={isSameDay(date, chip.value) ? "default" : "secondary"}
            size="sm"
            className="rounded-full whitespace-nowrap px-6 font-medium h-10"
            onClick={() => onSelect(chip.value)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <div className="bg-card border rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline text-lg font-bold">
            {format(month, "MMMM yyyy")}
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => setMonth(addDays(month, -30))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => setMonth(addDays(month, 30))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black text-muted-foreground mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {daysInView.map((d, i) => {
            const isSelected = isSameDay(d, date);
            const isToday = isSameDay(d, today);
            return (
              <Button
                key={i}
                variant={isSelected ? "default" : "ghost"}
                className={cn(
                  "p-0 h-10 w-full rounded-xl transition-all font-medium",
                  isSelected && "bg-primary text-primary-foreground scale-105 shadow-lg",
                  !isSelected && isToday && "text-primary border border-primary/20",
                  !isSelected && !isToday && "text-foreground hover:bg-secondary"
                )}
                onClick={() => onSelect(d)}
              >
                {format(d, "d")}
              </Button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center pt-4 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            Selected: {format(date, "PPP")}
          </p>
        </div>
      </div>
    </div>
  )
}