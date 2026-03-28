/**
 * Offline data domain layers (IMPROVEMENTS_ENHANCEMENTS_REPORT §1.3).
 * Each layer owns state + CRUD + hydrate for one domain; OfflineDataContext composes them
 * and exposes a single useOfflineData() API.
 */

export { useProductDataLayer } from './useProductDataLayer';
export { useEntityDataLayer } from './useEntityDataLayer';
export { useTransactionDataLayer } from './useTransactionDataLayer';
export { useBillDataLayer } from './useBillDataLayer';
export { useSyncStateLayer } from './useSyncStateLayer';
export { useEmployeeDataLayer } from './useEmployeeDataLayer';
export { useBranchDataLayer } from './useBranchDataLayer';
export { useInventoryDataLayer } from './useInventoryDataLayer';
export { useAccountingDataLayer } from './useAccountingDataLayer';
export { useCashDrawerDataLayer } from './useCashDrawerDataLayer';
export { useStoreSettingsDataLayer } from './useStoreSettingsDataLayer';
export { useNotificationsDataLayer } from './useNotificationsDataLayer';
export type {
  ProductDataLayerAdapter,
  ProductDataLayerResult,
  EntityDataLayerAdapter,
  EntityDataLayerResult,
  TransactionDataLayerAdapter,
  TransactionDataLayerResult,
  BillDataLayerAdapter,
  BillDataLayerResult,
  SyncStateLayerAdapter,
  SyncStateLayerResult,
  EmployeeDataLayerAdapter,
  EmployeeDataLayerResult,
  BranchDataLayerAdapter,
  BranchDataLayerResult,
  InventoryDataLayerAdapter,
  InventoryDataLayerResult,
  AccountingDataLayerAdapter,
  AccountingDataLayerResult,
  CashDrawerDataLayerAdapter,
  CashDrawerDataLayerResult,
  StoreSettingsDataLayerAdapter,
  StoreSettingsDataLayerResult,
  NotificationsDataLayerAdapter,
  NotificationsDataLayerResult,
  Tables,
} from './types';
