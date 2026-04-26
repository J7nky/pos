/**
 * Store settings domain layer for OfflineDataContext (§1.3).
 * Owns currency, exchangeRate, language, receiptSettings, lowStockAlertsEnabled, lowStockThreshold, defaultCommissionRate;
 * hydrate(storeData) from refreshData; updaters persist to getDB().stores and localStorage.
 */

import { useState, useCallback } from 'react';
import type { CurrencyCode } from '@pos-platform/shared';
import { getDB } from '../../lib/db';
import type { StoreSettingsDataLayerAdapter, StoreSettingsDataLayerResult } from './types';

function mergeStoreDataIntoReceiptSettings(store: any, existingSettings: any): any {
  if (!store) return existingSettings;
  return {
    ...existingSettings,
    storeName: store.name || existingSettings?.storeName || '',
    address: store.address || existingSettings?.address || '',
    phone1: existingSettings?.phone1 || store.phone || '',
    phone1Name: existingSettings?.phone1Name || '',
    phone2: existingSettings?.phone2 || '',
    phone2Name: existingSettings?.phone2Name || '',
    thankYouMessage: existingSettings?.thankYouMessage || 'Thank You!',
    billNumberPrefix: existingSettings?.billNumberPrefix || '000',
    showPreviousBalance: existingSettings?.showPreviousBalance !== undefined ? existingSettings.showPreviousBalance : true,
    showItemCount: existingSettings?.showItemCount !== undefined ? existingSettings.showItemCount : true,
    receiptWidth: existingSettings?.receiptWidth || 32,
    defaultPrinterType: existingSettings?.defaultPrinterType || 'auto',
    defaultPrinterName: existingSettings?.defaultPrinterName || '',
    autoPrint: existingSettings?.autoPrint !== undefined ? existingSettings.autoPrint : false,
  };
}

export function useStoreSettingsDataLayer(adapter: StoreSettingsDataLayerAdapter): StoreSettingsDataLayerResult {
  const {
    storeId,
    isOnline,
    isSyncing,
    updateUnsyncedCount,
    performSync,
    resetAutoSyncTimer,
    debouncedSync,
    reloadCurrencyState,
  } = adapter;

  const [currency, setCurrency] = useState<CurrencyCode>('LBP');
  const [exchangeRate, setExchangeRate] = useState(89500);
  const [language, setLanguage] = useState<'en' | 'ar' | 'fr'>('ar');
  const [receiptSettings, setReceiptSettings] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('receiptSettings');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    try {
      const stored = localStorage.getItem('lowStockThreshold');
      return stored ? parseInt(stored, 10) : 10;
    } catch {
      return 10;
    }
  });
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(10);

  const hydrate = useCallback(async (storeData: any) => {
    if (!storeData) {
      setCurrency('LBP');
      setDefaultCommissionRate(10);
      setExchangeRate(89500);
      setLowStockAlertsEnabled(true);
      return;
    }
    if (storeData.preferred_currency) setCurrency(storeData.preferred_currency);
    if (storeData.preferred_commission_rate !== undefined) setDefaultCommissionRate(storeData.preferred_commission_rate);
    if (storeData.low_stock_alert !== undefined) setLowStockAlertsEnabled(storeData.low_stock_alert);
    if (storeData.exchange_rate !== undefined) {
      setExchangeRate(storeData.exchange_rate);
    }
    if (storeData.preferred_language) setLanguage(storeData.preferred_language);
    setReceiptSettings((prev: any) => {
      const merged = mergeStoreDataIntoReceiptSettings(storeData, prev);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('receiptSettings', JSON.stringify(merged));
      }
      return merged;
    });
  }, [storeId]);

  const toggleLowStockAlerts = useCallback(
    async (enabled: boolean) => {
      if (!storeId) return;
      try {
        setLowStockAlertsEnabled(enabled);
        await getDB().stores.where('id').equals(storeId).modify({
          low_stock_alert: enabled,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await updateUnsyncedCount();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating low stock alert:', error);
        setLowStockAlertsEnabled(!enabled);
      }
    },
    [storeId, isOnline, isSyncing, updateUnsyncedCount, performSync, debouncedSync]
  );

  const updateLowStockThreshold = useCallback((threshold: number) => {
    setLowStockThreshold(threshold);
    if (typeof localStorage !== 'undefined') localStorage.setItem('lowStockThreshold', threshold.toString());
  }, []);

  const updateDefaultCommissionRate = useCallback(
    async (rate: number) => {
      if (!storeId) return;
      const prev = defaultCommissionRate;
      try {
        setDefaultCommissionRate(rate);
        await getDB().stores.update(storeId, {
          preferred_commission_rate: rate,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating commission rate:', error);
        setDefaultCommissionRate(prev);
      }
    },
    [storeId, defaultCommissionRate, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync]
  );

  const updateCurrency = useCallback(
    async (newCurrency: CurrencyCode) => {
      if (!storeId) return;
      const prev = currency;
      try {
        setCurrency(newCurrency);
        await getDB().stores.update(storeId, {
          preferred_currency: newCurrency,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await reloadCurrencyState?.(storeId);
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating currency:', error);
        setCurrency(prev);
      }
    },
    [storeId, currency, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync, reloadCurrencyState]
  );

  const updateExchangeRate = useCallback(
    async (rate: number) => {
      if (!storeId) return;
      const prev = exchangeRate;
      try {
        setExchangeRate(rate);
        // Keep the legacy scalar in sync with the rate map's entry for the
        // primary local currency so Phase 11/older read paths keep working.
        const store = await getDB().stores.get(storeId);
        const preferred = (store?.preferred_currency as CurrencyCode | undefined) ?? 'USD';
        const ratesMap: Partial<Record<CurrencyCode, number>> = {
          ...(store?.exchange_rates ?? {}),
        };
        if (preferred !== 'USD' && rate > 0) {
          ratesMap[preferred] = rate;
        }
        await getDB().stores.update(storeId, {
          exchange_rate: rate,
          exchange_rates: ratesMap,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await reloadCurrencyState?.(storeId);
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating exchange rate:', error);
        setExchangeRate(prev);
      }
    },
    [storeId, exchangeRate, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync, reloadCurrencyState]
  );

  /**
   * Phase 12: write a per-currency rate into stores.exchange_rates.
   * If `currency` is the store's preferred_currency, the legacy scalar
   * `exchange_rate` is kept in sync.
   */
  const updateExchangeRateFor = useCallback(
    async (currencyCode: CurrencyCode, rate: number) => {
      if (!storeId) return;
      if (currencyCode === 'USD') return;
      try {
        const store = await getDB().stores.get(storeId);
        const prevMap: Partial<Record<CurrencyCode, number>> = { ...(store?.exchange_rates ?? {}) };
        const nextMap: Partial<Record<CurrencyCode, number>> = { ...prevMap };
        if (rate > 0) nextMap[currencyCode] = rate;
        else delete nextMap[currencyCode];

        const preferred = (store?.preferred_currency as CurrencyCode | undefined) ?? 'USD';
        const updates: Record<string, unknown> = {
          exchange_rates: nextMap,
          _synced: false,
          updated_at: new Date().toISOString(),
        };
        if (currencyCode === preferred) {
          updates.exchange_rate = rate;
          setExchangeRate(rate);
        }
        await getDB().stores.update(storeId, updates);
        await reloadCurrencyState?.(storeId);
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating per-currency rate:', error);
        throw error;
      }
    },
    [storeId, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync, reloadCurrencyState]
  );

  /**
   * Phase 12: append a currency to stores.accepted_currencies (idempotent).
   * If `rate` is provided and the new currency is non-USD, also seed the
   * exchange_rates map.
   */
  const addAcceptedCurrency = useCallback(
    async (currencyCode: CurrencyCode, rate?: number) => {
      if (!storeId) return;
      try {
        const store = await getDB().stores.get(storeId);
        if (!store) return;
        const list = ((store.accepted_currencies as CurrencyCode[] | undefined) ?? []).slice();
        if (!list.includes(currencyCode)) list.push(currencyCode);
        const ratesMap: Partial<Record<CurrencyCode, number>> = { ...(store.exchange_rates ?? {}) };
        if (currencyCode !== 'USD' && rate !== undefined && rate > 0) {
          ratesMap[currencyCode] = rate;
        }
        await getDB().stores.update(storeId, {
          accepted_currencies: list,
          exchange_rates: ratesMap,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await reloadCurrencyState?.(storeId);
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error adding accepted currency:', error);
        throw error;
      }
    },
    [storeId, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync, reloadCurrencyState]
  );

  /**
   * Phase 12: remove a currency from stores.accepted_currencies. The
   * currency cannot be the preferred_currency, cannot be USD, and must
   * not be in use by any local inventory_item / open bill / transaction.
   * Local-only check — the parity test for the same rule on Supabase
   * lives in admin-app/storeService.checkCurrencyUsage.
   */
  const removeAcceptedCurrency = useCallback(
    async (currencyCode: CurrencyCode) => {
      if (!storeId) return;
      if (currencyCode === 'USD') {
        throw new Error('USD cannot be removed.');
      }
      const store = await getDB().stores.get(storeId);
      if (!store) return;
      if (store.preferred_currency === currencyCode) {
        throw new Error('Cannot remove the preferred currency. Switch preferred currency first.');
      }

      const db = getDB();
      const [invCount, txCount, billCount] = await Promise.all([
        db.inventory_items
          .where('store_id')
          .equals(storeId)
          .filter((it) => (it as { currency?: string }).currency === currencyCode && !it._deleted)
          .count(),
        db.transactions
          .where('store_id')
          .equals(storeId)
          .filter((tx) => (tx as { currency?: string }).currency === currencyCode && !tx._deleted)
          .count(),
        db.bills
          .where('store_id')
          .equals(storeId)
          .filter(
            (bill) =>
              (bill as { currency?: string }).currency === currencyCode &&
              bill.status !== 'cancelled' &&
              !bill._deleted
          )
          .count(),
      ]);

      if (invCount > 0 || txCount > 0 || billCount > 0) {
        throw new Error(
          `Cannot remove ${currencyCode}: ${invCount} inventory items, ${txCount} transactions, ${billCount} bills are still using it.`
        );
      }

      const list = ((store.accepted_currencies as CurrencyCode[] | undefined) ?? []).filter(
        (c) => c !== currencyCode
      );
      const ratesMap: Partial<Record<CurrencyCode, number>> = { ...(store.exchange_rates ?? {}) };
      delete ratesMap[currencyCode];

      await db.stores.update(storeId, {
        accepted_currencies: list,
        exchange_rates: ratesMap,
        _synced: false,
        updated_at: new Date().toISOString(),
      });
      await reloadCurrencyState?.(storeId);
      await updateUnsyncedCount();
      resetAutoSyncTimer();
      if (isOnline && !isSyncing) performSync(true);
      else debouncedSync();
    },
    [storeId, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync, reloadCurrencyState]
  );

  const updateLanguage = useCallback(
    async (newLanguage: 'en' | 'ar' | 'fr') => {
      if (!storeId) return;
      const prev = language;
      try {
        setLanguage(newLanguage);
        await getDB().stores.update(storeId, {
          preferred_language: newLanguage,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await updateUnsyncedCount();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating language:', error);
        setLanguage(prev);
      }
    },
    [storeId, language, isOnline, isSyncing, updateUnsyncedCount, performSync, debouncedSync]
  );

  const updateReceiptSettings = useCallback(async (newSettings: any) => {
    const prev = receiptSettings;
    try {
      setReceiptSettings(newSettings);
      if (typeof localStorage !== 'undefined') localStorage.setItem('receiptSettings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error updating receipt settings:', error);
      setReceiptSettings(prev);
    }
  }, [receiptSettings]);

  return {
    currency,
    exchangeRate,
    language,
    receiptSettings,
    lowStockAlertsEnabled,
    lowStockThreshold,
    defaultCommissionRate,
    hydrate,
    toggleLowStockAlerts,
    updateLowStockThreshold,
    updateDefaultCommissionRate,
    updateCurrency,
    updateExchangeRate,
    updateExchangeRateFor,
    addAcceptedCurrency,
    removeAcceptedCurrency,
    updateLanguage,
    updateReceiptSettings,
  };
}
