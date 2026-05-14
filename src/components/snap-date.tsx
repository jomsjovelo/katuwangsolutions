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

  if (!mounted || !month || !today) return <div className="h-64 animate-pulse bg-secondary/20 rounded-2xl" />;

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
            className="rounded-full whitespace-nowrap touch-target-48 px-6 font-medium"
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
              className="touch-target-48 rounded-xl"
              onClick={() => setMonth(addDays(month, -30))}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="touch-target-48 rounded-xl"
              onClick={() => setMonth(addDays(month, 30))}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-muted-foreground mb-2">
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
                  "touch-target-48 p-0 h-12 w-full rounded-xl transition-all font-medium",
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
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
            Selected: {format(date, "PPP")}
          </p>
        </div>
      </div>
    </div>
  )
}
