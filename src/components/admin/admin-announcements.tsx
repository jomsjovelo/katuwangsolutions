"use client";

import React, { useState } from 'react';
import { useAnnouncements, Announcement } from '@/hooks/use-announcements';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Megaphone, Trash2, Send, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminAnnouncements() {
  const { announcements, createAnnouncement, toggleAnnouncement, deleteAnnouncement } = useAnnouncements(false); // fetch all
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'success' | 'error'>('info');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createAnnouncement({
        title,
        message,
        type,
        isActive: true
      });
      setTitle('');
      setMessage('');
      setType('info');
    } catch (error) {
      console.error(error);
      alert('Failed to publish announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'success': return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      default: return <Info className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="lg:col-span-4">
        <Card className="shadow-xl border-primary/20 bg-gradient-to-b from-white to-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-800 uppercase tracking-tight">
              <Megaphone className="h-5 w-5 text-primary" /> New Broadcast
            </CardTitle>
            <CardDescription>Blast a message to all tenants instantly.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Headline</label>
                <Input 
                  placeholder="e.g. Scheduled Maintenance" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="font-bold border-slate-200"
                  maxLength={50}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Message</label>
                <textarea 
                  placeholder="Details about the announcement..." 
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full h-32 p-3 text-sm border border-slate-200 rounded-xl resize-none focus:ring-2 focus:ring-primary focus:outline-none"
                  maxLength={200}
                  required
                />
                <p className="text-[10px] text-right text-slate-400 font-medium">{message.length}/200</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['info', 'warning', 'success', 'error'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        "py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1",
                        type === t 
                          ? (t === 'warning' ? "bg-amber-100 border-amber-300 text-amber-800" :
                             t === 'error' ? "bg-red-100 border-red-300 text-red-800" :
                             t === 'success' ? "bg-emerald-100 border-emerald-300 text-emerald-800" :
                             "bg-primary/20 border-primary text-primary-foreground")
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      {getIcon(t)} {t}
                    </button>
                  ))}
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 font-bold text-sm bg-primary hover:bg-primary/90 text-white mt-4 shadow-lg shadow-primary/30"
                disabled={isSubmitting || !title || !message}
              >
                <Send className="mr-2 h-4 w-4" /> 
                {isSubmitting ? 'Publishing...' : 'Publish Broadcast'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-8 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 pl-1">Broadcast History</h3>
        
        {announcements.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 flex flex-col items-center">
            <Megaphone className="h-12 w-12 mb-4 opacity-50" />
            <p className="font-medium">No announcements published yet.</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <Card key={ann.id} className={cn(
              "transition-all duration-200 shadow-sm border-l-4",
              !ann.isActive ? "opacity-50 grayscale" : "",
              ann.type === 'warning' ? "border-l-amber-500" :
              ann.type === 'error' ? "border-l-destructive" :
              ann.type === 'success' ? "border-l-emerald-500" :
              "border-l-primary"
            )}>
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-4 items-start">
                  <div className="mt-1 bg-slate-100 p-2 rounded-full shrink-0">
                    {getIcon(ann.type)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      {ann.title}
                      {!ann.isActive && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest font-black">Archived</span>}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1 max-w-xl">{ann.message}</p>
                    {ann.createdAt && (
                      <p className="text-[10px] text-slate-400 mt-2 font-mono">
                        Published: {new Date(ann.createdAt?.seconds * 1000).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-4 w-full sm:w-auto justify-end">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live</span>
                    <Switch 
                      checked={ann.isActive}
                      onCheckedChange={(checked) => toggleAnnouncement(ann.id, checked)}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      if(confirm("Permanently delete this announcement?")) deleteAnnouncement(ann.id);
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
