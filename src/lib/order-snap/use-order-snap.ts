/**
 * Order Snap React Hook
 *
 * Provides reactive subscription to OrderSnapController via useSyncExternalStore.
 *
 * Design:
 * - All React hooks called unconditionally
 * - Never create stateful controllers directly during render
 * - Use memoized identity key containing tenantId and Firebase UID only (as selector)
 * - Acquire/initialize controller inside an effect
 * - Destroy/release the exact controller during cleanup
 * - Use useSyncExternalStore with stable subscribe/getSnapshot functions
 * - Expose loading, unavailable, locked, unlocked, and ready states
 * - Never derive canonical staff identity in the hook (comes from verified authority)
 */

import { useEffect, useSyncExternalStore, useState, useCallback, useRef, useMemo } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { User } from 'firebase/auth';
import { OrderSnapController, OrderSnapControllerState } from './order-snap-controller';

export type OrderSnapStatus =
  | 'loading'
  | 'unavailable'
  | 'locked'
  | 'unlocked'
  | 'ready';

type InitLifecycle = 'idle' | 'loading' | 'pending' | 'ready' | 'failed';

export interface UseOrderSnapResult {
  readonly state: OrderSnapControllerState | null;
  readonly controller: OrderSnapController | null;
  readonly status: OrderSnapStatus;
  readonly initialize: () => Promise<void>;
  readonly destroy: () => void;
}

const EMPTY_SERVER_SNAPSHOT: OrderSnapControllerState | null = null;

function mapAuthorityStateToStatus(authorityState: string | undefined): OrderSnapStatus {
  switch (authorityState) {
    case 'uninitialized':
      return 'loading';
    case 'unauthorized':
      return 'unavailable';
    case 'offline-locked':
      return 'locked';
    case 'offline-unlocked':
      return 'unlocked';
    case 'online-authorized':
      return 'ready';
    case 'expired':
    case 'catalog-mismatch':
      return 'unavailable';
    default:
      return 'loading';
  }
}

export function useOrderSnap(): UseOrderSnapResult {
  // One call each; no duplicates.
  const { currentTenant, isLoading: tenantLoading } = useTenant();
  const { user, loading: userLoading } = useUser();

  // Scalar identity; no useMemo around simple field reads.
  const tenantId = currentTenant?.id ?? null;
  const authUid = user?.uid ?? null;
  const identityKey = tenantId && authUid ? `${tenantId}:${authUid}` : null;

  // Stable token provider: dedicated ref for Firebase User, memoized callback keyed by authUid.
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const getIdToken = useCallback((): Promise<string | null> => {
    const u = userRef.current;
    if (!u) return Promise.resolve(null);
    if (authUid && u.uid !== authUid) return Promise.resolve(null);
    return u.getIdToken();
  }, [authUid]);

  // React state for active controller; setting it causes re-render and subscription replacement.
  const [controller, setController] = useState<OrderSnapController | null>(null);
  const [initLifecycle, setInitLifecycle] = useState<InitLifecycle>('idle');

  // Memoized stable callbacks whose dependency is the React-state controller.
  const subscribe = useCallback((callback: () => void): (() => void) => {
    if (!controller) return () => {};
    return controller.subscribe(callback);
  }, [controller]);

  const getSnapshot = useCallback((): OrderSnapControllerState | null => {
    if (!controller) return null;
    return controller.getState();
  }, [controller]);

  const getServerSnapshot = useCallback((): OrderSnapControllerState | null => {
    return EMPTY_SERVER_SNAPSHOT;
  }, []);

  const subscribedState = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Controller creation/initialization effect.
  // Dependencies: scalar loading/identity values + stable token provider.
  // Does NOT depend on currentTenant or user objects.
  useEffect(() => {
    // Loading takes priority.
    if (tenantLoading || userLoading) {
      setInitLifecycle('loading');
      return;
    }

    // Missing identity after loading -> unavailable.
    if (!tenantId || !authUid) {
      setController(null);
      setInitLifecycle('failed');
      return;
    }

    // Valid identity; create exactly one local controller.
    setInitLifecycle('pending');

    let localCancelled = false;

    const localController = new OrderSnapController({
      tenantId,
      authUid,
      getIdToken,
    });

    // Immediately set the controller so React renders and subscription switches.
    setController(localController);

    localController.initialize().then(() => {
      if (!localCancelled) {
        setInitLifecycle('ready');
      }
    }).catch(() => {
      if (!localCancelled) {
        localCancelled = true;
        localController.destroy();
        setController(current => current === localController ? null : current);
        setInitLifecycle('failed');
      }
    });

    // Cleanup: destroy local controller directly; clear state via identity comparison.
    return () => {
      localCancelled = true;
      localController.destroy();
      setController(current => current === localController ? null : current);
    };
  }, [tenantLoading, userLoading, tenantId, authUid, getIdToken]);

  const handleInitialize = useCallback((): Promise<void> => {
    if (!controller) return Promise.resolve();
    return controller.initialize();
  }, [controller]);

  const handleDestroy = useCallback((): void => {
    if (controller) {
      controller.destroy();
      setController(current => current === controller ? null : current);
    }
  }, [controller]);

  // Status precedence: explicit initialization lifecycle overrides controller state.
  let finalStatus: OrderSnapStatus;
  if (tenantLoading || userLoading) {
    finalStatus = 'loading';
  } else if (!tenantId || !authUid) {
    finalStatus = 'unavailable';
  } else if (initLifecycle === 'pending') {
    finalStatus = 'loading';
  } else if (initLifecycle === 'failed') {
    finalStatus = 'unavailable';
  } else if (subscribedState) {
    finalStatus = mapAuthorityStateToStatus(subscribedState.authorityState);
  } else {
    finalStatus = 'loading';
  }

  return {
    state: subscribedState,
    controller,
    status: finalStatus,
    initialize: handleInitialize,
    destroy: handleDestroy,
  };
}