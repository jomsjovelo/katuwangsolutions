import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Global state to catch the event early if it fires before React hydration / mount
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    // Notify any active hooks
    promptListeners.forEach(listener => listener(globalDeferredPrompt));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Set initial prompt if it fired before mount
    setDeferredPrompt(globalDeferredPrompt);

    // Subscribe to future prompts (just in case)
    const handlePrompt = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };
    promptListeners.add(handlePrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    // Detect any iOS device (iPhone, iPad, iPod)
    // We detect by device OS, not by browser brand, because on iOS all browsers
    // (Safari, Chrome, Firefox, Edge) use WebKit and none support `beforeinstallprompt`.
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    
    if (isIosDevice) {
      setIsIOS(true);
    }

    const handleAppInstalled = () => {
      // Clear the deferredPrompt so it can be garbage collected
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(handlePrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    const promptToUse = deferredPrompt || globalDeferredPrompt;
    if (!promptToUse) return;
    
    // Show the install prompt
    await promptToUse.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await promptToUse.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    // We've used the prompt, and can't use it again, throw it away
    globalDeferredPrompt = null;
    setDeferredPrompt(null);
  };

  return { deferredPrompt: deferredPrompt || globalDeferredPrompt, isInstalled, triggerInstall, isIOS };
}
