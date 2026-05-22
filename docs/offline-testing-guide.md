# Katuwang Solutions: Offline Capability Validation Guide

The Katuwang Solutions POS platform is designed to be **offline-first**. This means that users in areas with poor internet connectivity can continue to process sales, and the system will seamlessly synchronize the data to Firebase once the connection is restored.

This guide outlines how to manually validate this behavior using Chrome DevTools.

## Prerequisites
1. Ensure the Next.js development server or a production build is running locally (`npm run dev` or `npm run start`).
2. Log in to the application and navigate to the **Benta Dashboard** (POS).
3. Ensure you have an active network connection for the initial load so the app can cache the product catalog into IndexedDB.

## Step-by-Step Validation Protocol

### Step 1: Simulate Network Drop
1. Open **Chrome DevTools** (F12 or Right Click -> Inspect).
2. Navigate to the **Network** tab.
3. In the throttling dropdown (usually says "No throttling"), select **Offline**.
4. A warning icon will appear in the Network tab indicating you are now offline.

### Step 2: Perform Offline Transactions
1. In the Benta Dashboard, click on several products to add them to the cart.
2. Click the **Cash Checkout** button.
3. Observe the UI:
   - The receipt/success toast should still appear instantly.
   - The cart should clear.
   - The UI should remain highly responsive.
4. **Under the hood check:**
   - In DevTools, go to the **Application** tab.
   - Expand **IndexedDB** -> `firebaseLocalStorageDb`.
   - You should see the transaction mutations stored locally, waiting for sync.

### Step 3: Validate Resiliency Locks
1. Rapidly attempt to checkout multiple times while offline.
2. The UI should not lock up, and all transactions should be queued properly in IndexedDB without data corruption or lost promises, thanks to the newly implemented `runTransactionResilient` locks.

### Step 4: Restore Connectivity
1. Go back to the **Network** tab in DevTools.
2. Change the throttling dropdown back to **No throttling**.
3. **Observe:**
   - Check the **Console** tab or the Network requests. You should see background Firebase `batchWrite` or `commit` operations automatically firing to sync the offline transactions to the cloud.
   - Open a separate browser window pointing to your Firebase Console (Firestore Data viewer) to confirm the new `sales` documents have appeared.

## Troubleshooting
If transactions fail to sync when coming back online:
- Verify that `initializeFirestore(app, { localCache: persistentLocalCache(...) })` is correctly configured in `src/firebase/index.ts`.
- Ensure no wildcard default deny rules in `firestore.rules` are blocking the batch writes.
