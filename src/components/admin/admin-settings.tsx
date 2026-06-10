"use client";

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Settings, ShieldAlert, Save } from "lucide-react";

interface SystemConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  promoPrice: number;
  standardPrice: number;
  enterprisePrice: number;
}

const DEFAULT_CONFIG: SystemConfig = {
  maintenanceMode: false,
  maintenanceMessage: "We are currently undergoing scheduled maintenance to upgrade our systems. We will be back shortly.",
  promoPrice: 99,
  standardPrice: 199,
  enterprisePrice: 499
};

export function AdminSettings() {
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const { db } = initializeFirebase();
    const unsubscribe = onSnapshot(doc(db, 'system', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as SystemConfig);
      } else {
        // Initialize config if it doesn't exist
        setDoc(doc(db, 'system', 'config'), DEFAULT_CONFIG);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { db } = initializeFirebase();
      await setDoc(doc(db, 'system', 'config'), config, { merge: true });
      alert('System configuration saved successfully.');
    } catch (error) {
      console.error(error);
      alert('Failed to save configuration. Only Superadmins can perform this action.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <Card className="shadow-xl border-primary/20">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
          <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-800 uppercase tracking-tight">
            <Settings className="h-5 w-5 text-primary" /> Global Platform Settings
          </CardTitle>
          <CardDescription>Configure pricing and system-wide availability.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          
          {/* Maintenance Mode */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold text-slate-800 uppercase tracking-widest text-sm">System Maintenance Mode</h3>
              </div>
              <Switch 
                checked={config.maintenanceMode}
                onCheckedChange={(checked) => setConfig({ ...config, maintenanceMode: checked })}
                className="data-[state=checked]:bg-amber-500"
              />
            </div>
            
            {config.maintenanceMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-in slide-in-from-top-2">
                <label className="text-xs font-bold uppercase tracking-widest text-amber-800 mb-2 block">Maintenance Message</label>
                <textarea 
                  value={config.maintenanceMessage}
                  onChange={e => setConfig({ ...config, maintenanceMessage: e.target.value })}
                  className="w-full h-24 p-3 text-sm border border-amber-200 rounded-md bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <p className="text-[10px] text-amber-700 mt-1 font-medium">This message will be shown to all tenants attempting to log in.</p>
              </div>
            )}
          </div>

          {/* Pricing Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <h3 className="font-bold text-slate-800 uppercase tracking-widest text-sm">Subscription Pricing Defaults</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Promo Tier (₱)</label>
                <Input 
                  type="number"
                  value={config.promoPrice}
                  onChange={e => setConfig({ ...config, promoPrice: Number(e.target.value) })}
                  className="font-mono font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Standard Tier (₱)</label>
                <Input 
                  type="number"
                  value={config.standardPrice}
                  onChange={e => setConfig({ ...config, standardPrice: Number(e.target.value) })}
                  className="font-mono font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Enterprise Tier (₱)</label>
                <Input 
                  type="number"
                  value={config.enterprisePrice}
                  onChange={e => setConfig({ ...config, enterprisePrice: Number(e.target.value) })}
                  className="font-mono font-bold"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Note: Changing these values will update the defaults for new subscriptions. Existing active subscriptions will not be automatically charged the new amount.</p>
          </div>

          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="font-bold uppercase tracking-wider px-8"
            >
              <Save className="mr-2 h-4 w-4" /> 
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
