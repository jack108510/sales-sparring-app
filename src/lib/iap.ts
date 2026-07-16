/**
 * StoreKit / expo-iap integration for Sales Sparring
 *
 * Product IDs (must match App Store Connect):
 *   salessparringpro      → Pro  $29/mo  150 min
 *   SalesSparringPremium.Plan → Elite $49/mo  300 min
 */

import { Platform } from 'react-native';
import {
  initConnection,
  fetchProducts,
  finishTransaction,
  requestPurchase,
  getAvailablePurchases,
  emitter,
  OpenIapEvent,
  type Purchase,
} from 'expo-iap';
import { supabase } from './supabase';

export const PRODUCT_IDS = {
  pro: 'salessparringpro',
  elite: 'SalesSparringPremium.Plan',
} as const;

export const PLAN_CONFIG: Record<string, { plan: string; minutes: number }> = {
  [PRODUCT_IDS.pro]: { plan: 'pro', minutes: 150 },
  [PRODUCT_IDS.elite]: { plan: 'elite', minutes: 300 },
};

let connectionInitialized = false;

/**
 * Initialize StoreKit connection. Call once at app start.
 */
export async function setupIAP(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (connectionInitialized) return true;

  try {
    await initConnection({});

    // Pre-fetch subscription products so StoreKit has them loaded.
    // Without this, requestPurchase silently fails — the #1 cause of
    // "tapping upgrade does nothing" in production.
    const allProductIds = Object.values(PRODUCT_IDS);
    try {
      const products = await fetchProducts({ skus: allProductIds, type: 'subs' });
      console.log('[IAP] fetchProducts loaded:', products?.length ?? 0, 'products');
    } catch (fe) {
      console.warn('[IAP] fetchProducts failed (non-fatal, will retry on purchase):', fe);
    }

    connectionInitialized = true;
    return true;
  } catch (e) {
    console.warn('[IAP] initConnection failed:', e);
    return false;
  }
}

/**
 * Trigger a purchase for the given product ID.
 * Returns { success, error }.
 */
export async function purchaseProduct(
  productId: string,
): Promise<{ success: boolean; plan?: string; error?: string }> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { success: false, error: 'Purchases not supported on this platform' };
  }

  try {
    // Ensure products are loaded before attempting purchase.
    // If setupIAP's fetchProducts failed or was skipped, try again here.
    if (!connectionInitialized) {
      const ready = await setupIAP();
      if (!ready) {
        return { success: false, error: 'Could not connect to Apple in-app purchases. Please try again.' };
      }
    }

    // Warm StoreKit with the exact subscription, but do not block the purchase
    // solely because fetchProducts returns 0. Sandbox/TestFlight/App Review can
    // be briefly stale for first-time READY_TO_SUBMIT subscriptions; the real
    // source of truth is requestPurchase, which must be allowed to open StoreKit.
    try {
      const products = await fetchProducts({ skus: [productId], type: 'subs' });
      console.log('[IAP] fetchProducts for purchase loaded:', products?.length ?? 0, 'products');
    } catch (fe) {
      console.warn('[IAP] fetchProducts before purchase failed; still requesting StoreKit:', fe);
    }

    // Build purchase request for a subscription. expo-iap/OpenIAP expects
    // `type: 'subs'` for subscriptions and `apple.sku` for iOS.
    const purchaseArgs = {
      type: 'subs' as const,
      request: {
        apple: { sku: productId },
      },
    };
    const purchaseResult = (await requestPurchase(purchaseArgs)) as Purchase | Purchase[] | null;
    const purchases = Array.isArray(purchaseResult)
      ? purchaseResult
      : purchaseResult
        ? [purchaseResult]
        : [];

    for (const purchase of purchases) {
      const plan = await processPurchase(purchase);
      if (plan) return { success: true, plan };
    }

    // Most StoreKit flows resolve through the PurchaseUpdated listener instead
    // of this return value. Returning success keeps the WebView in an explicit
    // "Opening Apple purchase sheet…" state instead of looking inert.
    return { success: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    // User cancelled is not really an error
    if (msg.includes('cancel') || msg.includes('userCancelled') || e?.code === 'E_USER_CANCELLED') {
      return { success: false, error: 'cancelled' };
    }
    console.error('[IAP] requestPurchase error:', e);
    return { success: false, error: msg };
  }
}

/**
 * Restore previous purchases. Returns the plan of the best restored purchase, if any.
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  plan?: string;
  error?: string;
}> {
  try {
    const purchases = await getAvailablePurchases({});
    if (!purchases || purchases.length === 0) {
      return { success: false, error: 'No previous purchases found' };
    }

    // Find the best (highest-tier) purchase
    let bestPlan: string | undefined;
    for (const purchase of purchases) {
      const productId = (purchase as any).productId || (purchase as any).sku || '';
      const cfg = PLAN_CONFIG[productId];
      if (cfg) {
        if (cfg.plan === 'elite') {
          bestPlan = 'elite';
          break;
        }
        if (cfg.plan === 'pro' && bestPlan !== 'elite') {
          bestPlan = 'pro';
        }
      }
    }

    if (!bestPlan) {
      return { success: false, error: 'No active Sales Sparring subscription found' };
    }

    // Update Supabase
    await activatePlanInSupabase(bestPlan);
    return { success: true, plan: bestPlan };
  } catch (e: any) {
    console.error('[IAP] restorePurchases error:', e);
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Update ss_users row in Supabase with the new plan.
 */
export async function activatePlanInSupabase(plan: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const minutes = plan === 'elite' ? 300 : 150;
  const resetAt = new Date();
  resetAt.setMonth(resetAt.getMonth() + 1);
  resetAt.setDate(1);

  const { error } = await supabase
    .from('ss_users')
    .upsert(
      {
        id: user.id,
        plan,
        minutes_remaining: minutes,
        minutes_total: minutes,
        minutes_reset_at: resetAt.toISOString(),
        subscription_status: 'active',
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('[IAP] Supabase upsert error:', error);
  }
}

/**
 * Process a successful purchase event (finish transaction + update Supabase).
 * Returns the plan that was activated, or null.
 */
export async function processPurchase(
  purchase: Purchase,
): Promise<string | null> {
  const productId =
    (purchase as any).productId ||
    (purchase as any).sku ||
    (purchase as any).id ||
    '';

  const cfg = PLAN_CONFIG[productId];
  if (!cfg) {
    console.warn('[IAP] Unknown productId in purchase:', productId);
    return null;
  }

  try {
    // Acknowledge / finish the transaction
    await finishTransaction({ purchase, isConsumable: false });
  } catch (e) {
    console.warn('[IAP] finishTransaction error (non-fatal):', e);
  }

  await activatePlanInSupabase(cfg.plan);
  return cfg.plan;
}

/**
 * Register a one-time purchase listener.
 * Returns a cleanup function.
 */
export function addPurchaseListener(
  onSuccess: (plan: string) => void,
  onError: (message: string) => void,
): () => void {
  const successSub = emitter.addListener(
    OpenIapEvent.PurchaseUpdated,
    async (purchase: Purchase) => {
      const plan = await processPurchase(purchase);
      if (plan) onSuccess(plan);
    },
  );

  const errorSub = emitter.addListener(
    OpenIapEvent.PurchaseError,
    (err: any) => {
      const msg = err?.message || err?.debugMessage || 'Purchase failed';
      if (!msg.includes('cancel') && !msg.includes('userCancelled')) {
        onError(msg);
      }
    },
  );

  return () => {
    successSub.remove();
    errorSub.remove();
  };
}
