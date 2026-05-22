/**
 * Centralized AudioContext Singleton Provider for Katuwang POS & Credit Engine
 * Lazily initializes and manages browser AudioContext, preventing memory leak warnings.
 */

let sharedAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  
  // Auto-resume if context was suspended by browser autoplay constraints
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch((err) => {
      console.warn("Failed to resume shared AudioContext:", err);
    });
  }
  
  return sharedAudioCtx;
}

/**
 * Plays a clean high-pitched single beep for scanner success (1300Hz, 80ms)
 */
export function playBarcodeBeep() {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1300, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn("Audio Context playback failed:", e);
  }
}

/**
 * Plays a happy ascending cashier arpeggio double-beep (A5 to C6 notes)
 */
export function playCashlessDoubleBeep() {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  
  try {
    const playTone = (freq: number, startDelay: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
      
      gain.gain.setValueAtTime(0.05, ctx.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    };

    // Tone 1: A5 (880Hz)
    playTone(880, 0, 0.15);
    // Tone 2: C6 (1046.5Hz) after 80ms delay
    playTone(1046.5, 0.08, 0.25);
  } catch (e) {
    console.warn("Cashless dual-beep playback failed:", e);
  }
}

/**
 * Plays an ascending triangle swoosh simulating a slide-out register tray
 */
export function playCashRegisterSwoosh() {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.35);
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn("Swoosh register sound failed:", e);
  }
}
