import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface BirthdayPickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  error?: boolean;
}

const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Pebrero' },
  { value: '03', label: 'Marso' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Hunyo' },
  { value: '07', label: 'Hulyo' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setyembre' },
  { value: '10', label: 'Oktubre' },
  { value: '11', label: 'Nobyembre' },
  { value: '12', label: 'Disyembre' },
];

export function BirthdayPicker({ value, onChange, error }: BirthdayPickerProps) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');

  // Initialize from value prop
  useEffect(() => {
    if (value && value.includes('-')) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setYear(parts[0]);
        setMonth(parts[1]);
        setDay(parts[2]);
      }
    }
  }, [value]);

  // Generate Years (18 years ago down to 100 years ago)
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 18;
  const minYear = currentYear - 100;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i));

  // Determine max days in selected month/year
  let daysInMonth = 31;
  if (month === '02') {
    const y = parseInt(year);
    // Leap year check
    if (year && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) {
      daysInMonth = 29;
    } else {
      daysInMonth = 28;
    }
  } else if (['04', '06', '09', '11'].includes(month)) {
    daysInMonth = 30;
  }

  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));

  // Sync to parent
  useEffect(() => {
    if (month && day && year) {
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange(''); // clear out if not complete
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year]);

  // Adjust day if selected day exceeds new month's days
  useEffect(() => {
    if (day && parseInt(day) > daysInMonth) {
      setDay(String(daysInMonth).padStart(2, '0'));
    }
  }, [month, year, day, daysInMonth]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="birthday-month" className="text-[10px] uppercase font-bold text-slate-500">Buwan</Label>
        <Select name="birthday-month" value={month} onValueChange={setMonth}>
          <SelectTrigger id="birthday-month" className={cn("h-14 bg-white", error && "border-destructive")}>
            <SelectValue placeholder="Buwan" />
          </SelectTrigger>
          <SelectContent className="max-h-[250px]">
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="birthday-day" className="text-[10px] uppercase font-bold text-slate-500">Araw</Label>
        <Select name="birthday-day" value={day} onValueChange={setDay} disabled={!month}>
          <SelectTrigger id="birthday-day" className={cn("h-14 bg-white", error && "border-destructive")}>
            <SelectValue placeholder="Araw" />
          </SelectTrigger>
          <SelectContent className="max-h-[250px]">
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="birthday-year" className="text-[10px] uppercase font-bold text-slate-500">Taon</Label>
        <Select name="birthday-year" value={year} onValueChange={setYear}>
          <SelectTrigger id="birthday-year" className={cn("h-14 bg-white", error && "border-destructive")}>
            <SelectValue placeholder="Taon" />
          </SelectTrigger>
          <SelectContent className="max-h-[250px]">
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
