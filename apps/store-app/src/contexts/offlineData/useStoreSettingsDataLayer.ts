/**
 * Store settings domain layer for OfflineDataContext (§1.3).
 * Owns currency, exchangeRate, language, receiptSettings, lowStockAlertsEnabled, lowStockThreshold, defaultCommissionRate;
 * hydrate(storeData) from refreshData; updaters persist to getDB().stores and localStorage.
 */

import { useState, useCallback } from 'react';
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
  } = adapter;

  const [currency, setCurrency] = useState<'USD' | 'LBP'>('LBP');
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
      if (storeId) {
        const { CurrencyService } = await import('../../services/currencyService');
        await CurrencyService.getInstance().refreshExchangeRate(storeId);
      }
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
    async (newCurrency: 'USD' | 'LBP') => {
      if (!storeId) return;
      const prev = currency;
      try {
        setCurrency(newCurrency);
        await getDB().stores.update(storeId, {
          preferred_currency: newCurrency,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating currency:', error);
        setCurrency(prev);
      }
    },
    [storeId, currency, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync]
  );

  const updateExchangeRate = useCallback(
    async (rate: number) => {
      if (!storeId) return;
      const prev = exchangeRate;
      try {
        setExchangeRate(rate);
        await getDB().stores.update(storeId, {
          exchange_rate: rate,
          _synced: false,
          updated_at: new Date().toISOString(),
        });
        await updateUnsyncedCount();
        resetAutoSyncTimer();
        if (isOnline && !isSyncing) performSync(true);
        else debouncedSync();
      } catch (error) {
        console.error('Error updating exchange rate:', error);
        setExchangeRate(prev);
      }
    },
    [storeId, exchangeRate, isOnline, isSyncing, updateUnsyncedCount, resetAutoSyncTimer, performSync, debouncedSync]
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
    updateLanguage,
    updateReceiptSettings,
  };
}
