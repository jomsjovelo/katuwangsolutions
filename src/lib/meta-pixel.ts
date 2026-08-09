export type MetaEventName =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'CompleteRegistration';

export type MetaEventParameters = Record<
  string,
  string | number | boolean | string[] | undefined
>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

type QueuedEvent = {
  method: 'track' | 'trackCustom';
  eventName: string;
  parameters: MetaEventParameters;
};

const eventQueue: QueuedEvent[] = [];

/**
 * Flush any queued events once Meta Pixel SDK is loaded
 */
export function flushMetaEventQueue() {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') {
    return;
  }

  while (eventQueue.length > 0) {
    const item = eventQueue.shift();
    if (item) {
      window.fbq(item.method, item.eventName, item.parameters);
    }
  }
}

/**
 * Fire Meta Pixel event immediately if window.fbq is ready,
 * otherwise push to client-side queue to prevent race condition losses.
 */
export function trackMetaEvent(
  eventName: MetaEventName,
  parameters: MetaEventParameters = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.fbq === 'function') {
    flushMetaEventQueue();
    window.fbq('track', eventName, parameters);
  } else {
    eventQueue.push({ method: 'track', eventName, parameters });
  }
}

export function trackMetaCustomEvent(
  eventName: string,
  parameters: MetaEventParameters = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.fbq === 'function') {
    flushMetaEventQueue();
    window.fbq('trackCustom', eventName, parameters);
  } else {
    eventQueue.push({ method: 'trackCustom', eventName, parameters });
  }
}
