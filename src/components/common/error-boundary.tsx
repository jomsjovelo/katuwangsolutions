"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showLogs: boolean;
}

export class KatuwangErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showLogs: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showLogs: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Katuwang Error Boundary caught an aberya:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, showLogs: false });
    window.location.reload();
  };

  private toggleLogs = () => {
    this.setState(prev => ({ showLogs: !prev.showLogs }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 w-full bg-slate-50/50">
          <div className="bg-white/80 backdrop-blur-md border border-red-100 rounded-3xl p-6 shadow-xl max-w-sm w-full text-center space-y-4 animate-in fade-in duration-300">
            <div className="h-14 w-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <AlertCircle className="h-7 w-7" />
            </div>
            
            <div className="space-y-2">
              <h3 className="font-headline font-black text-slate-800 text-lg">May kaunting aberya!</h3>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Huwag mag-alala, ligtas ang iyong transaksyon at aklat-de-benta. Pindutin ang buton sa ibaba para mag-refresh.
              </p>
              
              {this.state.error && (
                <div className="text-left pt-2">
                  <button 
                    onClick={this.toggleLogs}
                    className="flex items-center justify-between w-full text-[10px] text-slate-400 font-bold hover:text-slate-600 transition-colors py-1"
                  >
                    <span>Detalles ng error</span>
                    {this.state.showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  
                  {this.state.showLogs && (
                    <div className="bg-slate-50 border rounded-xl p-2.5 mt-1 text-[8px] font-mono max-h-[120px] overflow-y-auto text-slate-500 select-all leading-normal break-all">
                      {this.state.error.stack || this.state.error.message}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <Button 
              onClick={this.handleReset}
              className="w-full h-12 bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-transform border-none"
            >
              <RefreshCw className="h-4 w-4" /> I-refresh ang Screen
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
