import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Trash2, Plus } from 'lucide-react';
import { BudgetPreset } from '@/lib/schemas/budget';
import { useToast } from '@/hooks/use-toast';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: BudgetPreset[];
  onSavePresets: (newPresets: BudgetPreset[]) => Promise<void>;
}

const DEFAULT_ICONS = ['🚌', '🍱', '☕', '📱', '🛒', '⚡', '💧', '⛽', '🍿', '🎁'];

export function PresetModal({
  isOpen,
  onClose,
  presets,
  onSavePresets,
}: PresetModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState('🚌');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || !category) return;
    if (presets.length >= 20) {
      toast({
        title: 'Limit Reached',
        description: 'You can have a maximum of 20 quick-log presets.',
        variant: 'destructive',
      });
      return;
    }

    const newPreset: BudgetPreset = {
      id: `preset_${Date.now()}`,
      icon: icon || '⚡',
      title: title.trim(),
      amountCentavos: Math.round(parseFloat(amount) * 100),
      category: category.trim(),
      type: 'expense',
    };

    try {
      setIsSubmitting(true);
      const updated = [...presets, newPreset];
      await onSavePresets(updated);
      toast({ title: 'Preset Added', description: `"${title}" is now available in 1-Tap Presets.` });
      setTitle('');
      setAmount('');
      setCategory('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      setIsSubmitting(true);
      const updated = presets.filter((p) => p.id !== presetId);
      await onSavePresets(updated);
      toast({ title: 'Preset Removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-lg text-slate-800 tracking-tight">1-Tap Presets ({presets.length}/20)</h3>
            <p className="text-xs text-slate-500">Manage your 1-second quick-log shortcuts</p>
          </div>
        </div>

        {/* Existing Presets List */}
        <div className="max-h-40 overflow-y-auto space-y-1.5 mb-4 pr-1">
          {presets.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">No custom presets added yet. Add one below!</p>
          ) : (
            presets.map((preset) => (
              <div key={preset.id} className="bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{preset.icon || '⚡'}</span>
                  <div>
                    <p className="font-bold text-xs text-slate-800">{preset.title}</p>
                    <p className="text-[10px] text-slate-500">{preset.category} • ₱{(preset.amountCentavos / 100).toLocaleString()}</p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => handleDeletePreset(preset.id)}
                  className="h-7 w-7 text-slate-400 hover:text-rose-600 rounded-lg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Add Preset Form */}
        {presets.length < 20 && (
          <form onSubmit={handleAddPreset} className="space-y-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-700">Add New Preset</p>
            
            <div className="flex gap-2">
              <div className="w-16">
                <Label htmlFor="preset-icon-select" className="text-[10px] font-bold text-slate-500 mb-1 block">Emoji</Label>
                <select
                  id="preset-icon-select"
                  name="presetIcon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-center text-sm"
                >
                  {DEFAULT_ICONS.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Label htmlFor="preset-title-input" className="text-[10px] font-bold text-slate-500 mb-1 block">Title</Label>
                <Input
                  id="preset-title-input"
                  name="presetTitle"
                  required
                  placeholder="e.g. Pamasahe, Kape"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="preset-amount-input" className="text-[10px] font-bold text-slate-500 mb-1 block">Amount (₱)</Label>
                <Input
                  id="preset-amount-input"
                  name="presetAmount"
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="preset-category-input" className="text-[10px] font-bold text-slate-500 mb-1 block">Category</Label>
                <Input
                  id="preset-category-input"
                  name="presetCategory"
                  required
                  placeholder="e.g. Food, Transportation"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1 mt-2"
            >
              <Plus className="h-3.5 w-3.5" /> Add Preset
            </Button>
          </form>
        )}

        <div className="pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full text-slate-500 text-xs font-bold rounded-xl"
          >
            Close
          </Button>
        </div>

      </div>
    </div>
  );
}
