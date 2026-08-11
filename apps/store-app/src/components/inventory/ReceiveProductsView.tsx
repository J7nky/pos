import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, X, ArrowLeft, ArrowRight, Truck, AlertTriangle } from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SupplierFormModal from '../common/SupplierFormModal';
import AddProductModal from './AddProductModal';
import AcceptedCurrencySelect from '../common/AcceptedCurrencySelect';
import MoneyInput from '../common/MoneyInput';
import type { CurrencyCode } from '@pos-platform/shared';
import { CURRENCY_META } from '@pos-platform/shared';
import { useI18n } from '../../i18n';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { saveProductTag, saveNote, getLastThreeNotes, getMatchingNotes, getAllNotes } from '../../utils/productTags';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { getTranslatedString } from '../../utils/multilingual';
import { useCategoryLookup } from '../../hooks/useCategoryLookup';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { normalizeNameForComparison } from '../../utils/nameNormalization';
import { useBlocker } from 'react-router-dom';

/**
 * Full-page counterpart to ReceiveFormModal — the "dock sheet".
 *
 * Same batch payload and validation rules as the modal, laid out as a page:
 * a manifest of received lines on the left, a sticky tally + terms rail on the
 * right. Edit mode is intentionally absent; batch editing still runs through
 * ReceiveFormModal from ReceivedBills.
 */

function normalizeToAccepted(value: unknown, accepted: CurrencyCode[], fallback: CurrencyCode): CurrencyCode {
  if (typeof value === 'string' && (accepted as string[]).includes(value)) return value as CurrencyCode;
  return fallback;
}

/** Money for read-only display. Symbol leads, matching the MoneyInput prefixes on this page. */
function formatMoney(amount: number, code: CurrencyCode): string {
  const meta = CURRENCY_META[code];
  const decimals = meta?.decimals ?? 2;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: 'latn',
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${meta?.symbol ?? code}${formatted}`;
}

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: 'latn',
  }).format(Number.isFinite(value) ? value : 0);
}

type BulkItem = {
  product_id?: string;
  quantity: string;
  unit: string;
  price?: string;
  price_currency?: CurrencyCode;
  selling_price?: string;
  selling_price_currency?: CurrencyCode;
  weight?: string;
  sku?: string;
  weight_tracked?: boolean;
};

interface ReceiveProductsViewProps {
  onClose: () => void;
  onSuccess: (data: any) => Promise<void>;
  products: any[];
  suppliers: any[];
  defaultCommissionRate: number;
  preferredCurrency: CurrencyCode;
  acceptedCurrencies: CurrencyCode[];
  recentSuppliers: string[];
  setRecentSuppliers: (suppliers: string[]) => void;
  form: any;
  setForm: (form: any) => void;
  errors: any;
  setErrors: (errors: any) => void;
  addSupplier?: (supplier: any) => Promise<void>;
}

/** Rail section heading — the docket-form register, used only three times on the page. */
const RailHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
    {children}
  </h2>
);

// Heights match MoneyInput's 44px so money and plain fields line up across a row.
// Everything on this page uses the app-wide blue; the tally panel carries the
// weight by being a filled surface rather than by taking a colour of its own.
const fieldClass =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const cellFieldClass =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const errorFieldClass = 'border-red-500 focus:border-red-500 focus:ring-red-500/25';

// One width for every data-entry column, so the manifest reads as a grid.
// The line number, product picker, tally, and remove button sit outside that
// rhythm on purpose — they hold labels, not inputs.
const colFieldClass = 'w-36';
const headCellClass = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

const ReceiveProductsView: React.FC<ReceiveProductsViewProps> = ({
  onClose,
  onSuccess,
  products,
  suppliers,
  defaultCommissionRate,
  preferredCurrency,
  acceptedCurrencies,
  recentSuppliers,
  setRecentSuppliers,
  form,
  setForm,
  errors,
  setErrors,
  addSupplier,
}) => {
  const [loading, setLoading] = useState(false);
  const [bulkProducts, setBulkProducts] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<Record<string, BulkItem>>({});
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  // Which manifest row asked for a brand-new product, and the name it is waiting on.
  const [addProductForRow, setAddProductForRow] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<{ row: string; name: string } | null>(null);
  const [showAsTag, setShowAsTag] = useState(false);
  const [notesSuggestions, setNotesSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState<'back' | 'navigate' | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  const { t, language } = useI18n();
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const { units, categories, addProduct, refreshData } = useOfflineData();
  const categoryLookup = useCategoryLookup();
  const { getProductName } = useProductMultilingual();

  const activeCategoryLabels = useMemo(
    () => categories
      .filter((c) => c.is_active)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((c) => getTranslatedString(c.name, language as 'en' | 'ar' | 'fr')),
    [categories, language]
  );
  const activeUnits = useMemo(
    () => units
      .filter((u) => u.is_active)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [units]
  );
  const defaultUnitCode = activeUnits[0]?.code ?? 'box';
  // Weight-tracked default: checked when the selected unit is a mass unit (kg, g, ...).
  const isMassUnitCode = (code?: string) =>
    units.some((u) => u.code === code && u.system_role === 'mass');
  const acList = useMemo(
    () => (acceptedCurrencies.length > 0 ? acceptedCurrencies : [preferredCurrency]),
    [acceptedCurrencies, preferredCurrency]
  );
  const batchCurrency = normalizeToAccepted(form.porterage_currency, acList, preferredCurrency);

  // addProduct writes to Dexie but doesn't push into context state — the new
  // product only reaches `products` on the next rehydration. Watch for it by
  // name and drop it into the row that asked for it.
  useEffect(() => {
    if (!pendingProduct) return;
    const wanted = normalizeNameForComparison(pendingProduct.name);
    const match = products.find((p: any) => normalizeNameForComparison(getProductName(p)) === wanted);
    if (!match) return;
    setBulkItems((prev) => (
      prev[pendingProduct.row]
        ? { ...prev, [pendingProduct.row]: { ...prev[pendingProduct.row], product_id: match.id } }
        : prev
    ));
    setPendingProduct(null);
  }, [products, pendingProduct, getProductName]);

  const addProductRow = () => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 11);
    const newProductId = `new_${timestamp}_${randomSuffix}_${bulkProducts.length}`;
    const rowCur = normalizeToAccepted(preferredCurrency, acList, preferredCurrency);
    setBulkProducts((prev) => [...prev, newProductId]);
    setBulkItems((prev) => ({
      ...prev,
      [newProductId]: {
        product_id: '',
        quantity: '',
        unit: defaultUnitCode,
        price: '',
        price_currency: rowCur,
        selling_price: '',
        selling_price_currency: rowCur,
        weight: '',
      },
    }));
  };

  const removeProductRow = (productId: string) => {
    setBulkProducts((prev) => prev.filter((id) => id !== productId));
    setBulkItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  // Seed the manifest with one empty line.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    addProductRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalize the date and fee currencies, and keep supplier consistent with the supply type.
  useEffect(() => {
    const today = getTodayLocalDate();
    const updates: any = {};

    if (form.received_at !== today && !form.received_at) {
      updates.received_at = today;
    }

    const feeBase = normalizeToAccepted(form.porterage_currency, acList, preferredCurrency);
    if (form.porterage_currency !== feeBase) updates.porterage_currency = feeBase;
    const xfer = normalizeToAccepted(form.transfer_currency, acList, feeBase);
    if (form.transfer_currency !== xfer) updates.transfer_currency = xfer;
    const plas = normalizeToAccepted(form.plastic_currency, acList, feeBase);
    if (form.plastic_currency !== plas) updates.plastic_currency = plas;

    // Cash purchases always bill the Trade supplier.
    if (form.type === 'cash') {
      const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
      if (tradeSupplier && form.supplier_id !== tradeSupplier.id) {
        updates.supplier_id = tradeSupplier.id;
      }
    }

    // Trade cannot be used for commission.
    if (form.type === 'commission') {
      const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
      if (tradeSupplier && (form.supplier_id === tradeSupplier.id || form.supplier_id === 'trade')) {
        updates.supplier_id = '';
      }
    }

    if (Object.keys(updates).length > 0) {
      setForm({ ...form, ...updates });
    }
  }, [suppliers, form, setForm, preferredCurrency, acList]);

  /**
   * Lines with anything typed into them. Only the manifest is at risk on exit —
   * supplier, fees and notes live in the parent's form state and survive.
   */
  const enteredLines = useMemo(
    () => bulkProducts.filter((pid) => {
      const item = bulkItems[pid];
      if (!item) return false;
      return Boolean(item.product_id || item.quantity || item.weight || item.price || item.selling_price || item.sku);
    }).length,
    [bulkProducts, bulkItems]
  );

  // Guards navigating away by sidebar/link. The Back button is handled separately
  // because it closes the view without a route change.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => enteredLines > 0 && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') setDiscardPrompt('navigate');
  }, [blocker.state]);

  const handleBack = () => {
    if (enteredLines > 0) {
      setDiscardPrompt('back');
      return;
    }
    onClose();
  };

  const confirmDiscard = () => {
    const wasNavigating = discardPrompt === 'navigate';
    setDiscardPrompt(null);
    if (wasNavigating) blocker.proceed?.();
    else onClose();
  };

  const cancelDiscard = () => {
    const wasNavigating = discardPrompt === 'navigate';
    setDiscardPrompt(null);
    if (wasNavigating) blocker.reset?.();
  };

  // Escape closes the discard dialog, then the notes suggestions. A page is left
  // through Back, never through Escape.
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (discardPrompt) cancelDiscard();
      else if (showSuggestions) setShowSuggestions(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }); // re-registered each render so the handler always sees the current blocker

  // The safe choice takes focus when the dialog opens.
  useEffect(() => {
    if (discardPrompt) keepEditingRef.current?.focus();
  }, [discardPrompt]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        notesTextareaRef.current &&
        !notesTextareaRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  const selectedProductIds = () =>
    bulkProducts.map((pid) => bulkItems[pid]?.product_id).filter(Boolean) as string[];

  const refreshSuggestions = (note: string) => {
    const productIds = selectedProductIds();

    if (!note.trim()) {
      const lastThree = productIds.length > 0 ? getLastThreeNotes(productIds[0]) : getLastThreeNotes();
      setNotesSuggestions(lastThree);
      setShowSuggestions(lastThree.length > 0);
      return;
    }

    if (productIds.length > 0) {
      const matching = getMatchingNotes(productIds[0], note);
      setNotesSuggestions(matching);
      setShowSuggestions(matching.length > 0);
      return;
    }

    const searchLower = note.toLowerCase().trim();
    const matching = getAllNotes()
      .filter((n) => n.note.toLowerCase().includes(searchLower))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((n) => n.note);
    const unique = Array.from(new Set(matching));
    setNotesSuggestions(unique);
    setShowSuggestions(unique.length > 0);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm({ ...form, status: value });
    refreshSuggestions(value);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setForm({ ...form, status: suggestion });
    setShowSuggestions(false);
    notesTextareaRef.current?.focus();
  };

  // Keep suggestions in step with product selection while the notes field has focus.
  useEffect(() => {
    if (notesTextareaRef.current !== document.activeElement) return;
    refreshSuggestions(form.status || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkProducts, bulkItems, form.status]);

  const selectedSupplier = form.type === 'cash'
    ? suppliers.find((s: any) => s.name === 'Trade') || { name: t('inventory.trade'), id: 'trade' }
    : suppliers.find((s: any) => s.id === form.supplier_id) || null;

  /**
   * Running tally. Line value mirrors inventoryPurchaseService.calculatePurchaseAmounts:
   * weight × price when a weight is present, otherwise quantity × price.
   */
  const tally = useMemo(() => {
    let units = 0;
    let weight = 0;
    let unpriced = 0;
    const goods = new Map<CurrencyCode, number>();
    const lineValues = new Map<string, { value: number; currency: CurrencyCode }>();

    for (const pid of bulkProducts) {
      const item = bulkItems[pid];
      if (!item) continue;
      const qty = Number(item.quantity) || 0;
      const wt = Number(item.weight) || 0;
      units += qty;
      weight += wt;

      if (form.type === 'commission') continue;

      const price = Number(item.price) || 0;
      if (!price) {
        if (item.product_id) unpriced += 1;
        continue;
      }
      const value = wt > 0 ? wt * price : qty * price;
      const currency = normalizeToAccepted(
        item.price_currency || item.selling_price_currency,
        acList,
        batchCurrency
      );
      goods.set(currency, (goods.get(currency) ?? 0) + value);
      lineValues.set(pid, { value, currency });
    }

    const porterage = Number(form.porterage_fee) || 0;
    const transfer = Number(form.transfer_fee) || 0;
    const plastic = form.empty_plastic
      ? (Number(form.plastic_count) || 0) * (Number(form.plastic_price) || 0)
      : 0;
    const feeTotal = porterage + transfer + plastic;

    const totals = new Map<CurrencyCode, number>(goods);
    if (feeTotal > 0) totals.set(batchCurrency, (totals.get(batchCurrency) ?? 0) + feeTotal);

    return {
      lines: bulkProducts.length,
      units,
      weight,
      unpriced,
      goods,
      lineValues,
      porterage,
      transfer,
      plastic,
      feeTotal,
      totals,
    };
  }, [bulkProducts, bulkItems, form.type, form.porterage_fee, form.transfer_fee, form.empty_plastic, form.plastic_count, form.plastic_price, acList, batchCurrency]);

  const validate = () => {
    const errors: any = {};

    if (form.type === 'commission' || form.type === 'credit') {
      if (!form.supplier_id) {
        errors.supplier_id = `${t('inventory.supplierRequiredForCommissionPurchases')}`;
      } else {
        const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
        if ((tradeSupplier && form.supplier_id === tradeSupplier.id) || form.supplier_id === 'trade') {
          errors.supplier_id = `${t('inventory.pleaseSelectADifferentSupplier')}`;
        }
      }
    }
    if (form.type === 'credit' && !form.supplier_id) {
      errors.supplier_id = `${t('inventory.supplierRequiredForCreditPurchases')}`;
    }

    if (!bulkProducts || bulkProducts.length === 0) {
      errors.product_id = t('inventory.receivePage.selectAtLeastOne');
    } else {
      for (const pid of bulkProducts) {
        const item = bulkItems[pid];
        if (!item || !item.product_id) {
          errors[`product_${pid}`] = `${t('inventory.selectProduct')}`;
        }
        if (!item || !item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) < 1) {
          errors[`quantity_${pid}`] = `${t('inventory.quantityMustBeAtLeast1')}`;
        }

        const rowWeightTracked = item ? (item.weight_tracked ?? isMassUnitCode(item.unit)) : false;
        if (rowWeightTracked && (!item?.weight || isNaN(Number(item.weight)) || Number(item.weight) <= 0)) {
          errors[`weight_${pid}`] = `${t('losses.weightRequired')}`;
        }

        if (form.type === 'cash') {
          if (!item || !item.price || isNaN(Number(item.price)) || Number(item.price) <= 0) {
            errors[`price_${pid}`] = `${t('inventory.priceRequiredForCashPurchases')}`;
          }
          if (item && !item.weight && !item.quantity) {
            errors[`quantity_${pid}`] = `${t('inventory.bothWeightOrQuantityIsRequiredForCashPurchases')}`;
          }
        }

        // Credit: price is optional here — it can be set later on the non-priced items page.
      }
    }

    if (form.empty_plastic) {
      if (form.plastic_price <= 0 || form.plastic_price === undefined || isNaN(Number(form.plastic_price))) {
        errors.plastic_price = `${t('inventory.plasticPriceRequiredWhenPlasticMortgageIsChecked')}`;
      } else if (form.plastic_count <= 0 || form.plastic_count === undefined || isNaN(Number(form.plastic_count))) {
        errors.plastic_count = `${t('inventory.plasticCountRequiredWhenPlasticMortgageIsChecked')}`;
      }
    }

    if (!form.received_at) {
      errors.received_at = `${t('inventory.receivedDateRequired')}`;
    } else {
      const receivedDate = new Date(form.received_at);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (receivedDate > today) {
        errors.received_at = `${t('inventory.receivedDateCannotBeInTheFuture')}`;
      }
    }

    if (form.porterage_fee && (isNaN(Number(form.porterage_fee)) || Number(form.porterage_fee) < 0)) {
      errors.porterage_fee = `${t('inventory.porterageFeeMustBeAPositiveNumber')}`;
    }
    if (form.transfer_fee && (isNaN(Number(form.transfer_fee)) || Number(form.transfer_fee) < 0)) {
      errors.transfer_fee = `${t('inventory.transferFeeMustBeAPositiveNumber')}`;
    }
    if (form.type === 'commission') {
      if (!form.commission_rate || isNaN(Number(form.commission_rate)) || Number(form.commission_rate) < 0) {
        errors.commission_rate = `${t('inventory.commissionRateMustBeAPercentage')}`;
      }
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const items = bulkProducts.map((pid) => {
        const bi = bulkItems[pid];
        const itemCurrency = normalizeToAccepted(
          bi.price_currency || bi.selling_price_currency,
          acList,
          batchCurrency
        );
        return {
          product_id: bi.product_id as string,
          supplier_id: form.type === 'cash' ? 'trade' : form.supplier_id,
          type: form.type,
          quantity: parseInt(bi.quantity),
          received_quantity: parseInt(bi.quantity),
          unit: bi.unit,
          weight: bi.weight ? parseFloat(bi.weight) : undefined,
          price: (form.type === 'cash' || form.type === 'credit') && bi.price ? parseFloat(bi.price) : undefined,
          selling_price: bi.selling_price ? parseFloat(bi.selling_price) : undefined,
          currency: itemCurrency,
          status: form.status || undefined,
          sku: bi.sku?.trim() || undefined,
          weight_tracked: bi.weight_tracked ?? isMassUnitCode(bi.unit),
        };
      });

      const plasticFee = form.empty_plastic
        ? Number(form.plastic_count || 0) * Number(form.plastic_price || 0)
        : undefined;

      await onSuccess({
        mode: 'batch',
        batch: {
          supplier_id: form.type === 'cash' ? 'trade' : form.supplier_id,
          status: form.status || undefined,
          porterage_fee: form.porterage_fee ? parseFloat(form.porterage_fee) : undefined,
          transfer_fee: form.transfer_fee ? parseFloat(form.transfer_fee) : undefined,
          commission_rate: form.type === 'commission' && form.commission_rate ? parseFloat(form.commission_rate) : undefined,
          type: form.type,
          plastic_fee: plasticFee,
          received_at: form.received_at,
          currency: batchCurrency,
          items,
        },
      });

      if (showAsTag && form.status && form.status.trim()) {
        bulkProducts.forEach((pid) => {
          const bi = bulkItems[pid];
          if (bi.product_id) saveProductTag(bi.product_id, form.status);
        });
      }

      if (form.status && form.status.trim()) {
        bulkProducts.forEach((pid) => {
          const bi = bulkItems[pid];
          if (bi.product_id) saveNote(form.status, bi.product_id);
        });
      }

      const feeReset = normalizeToAccepted(preferredCurrency, acList, preferredCurrency);
      setForm({
        supplier_id: form.supplier_id,
        type: form.type,
        porterage_fee: '',
        transfer_fee: '',
        commission_rate: '',
        status: '',
        empty_plastic: false,
        plastic_count: '',
        plastic_price: '',
        porterage_currency: feeReset,
        transfer_currency: feeReset,
        plastic_currency: feeReset,
        received_at: getTodayLocalDate(),
      });
      setBulkProducts([]);
      setBulkItems({});
      setErrors({});
      setShowAsTag(false);
      setNotesSuggestions([]);
      setShowSuggestions(false);
      onClose();
    } catch (e) {
      console.error('[RECEIVE_PRODUCTS_VIEW] Error receiving inventory:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);

      if (errorMessage.includes('Insufficient cash drawer balance') || errorMessage.includes('insufficient')) {
        const balanceMatch = errorMessage.match(/Current balance:\s*([^,]+),\s*Required:\s*(.+)/);
        if (balanceMatch && balanceMatch.length >= 3) {
          setErrors({
            form: t('inventory.insufficientCashDrawerBalance', {
              currentBalance: balanceMatch[1].trim(),
              requiredAmount: balanceMatch[2].trim(),
            }),
          });
        } else {
          setErrors({ form: errorMessage || t('inventory.insufficientCashDrawerBalance', { currentBalance: '', requiredAmount: '' }) });
        }
      } else {
        setErrors({ form: `${t('inventory.failedToReceiveInventory')}: ${errorMessage}` });
      }
    }
    setLoading(false);
  };

  const handleAddSupplier = async (supplierData: any) => {
    if (!addSupplier) {
      console.error('addSupplier function not provided');
      return;
    }
    try {
      await addSupplier(supplierData);
      setShowSupplierModal(false);
    } catch (error) {
      console.error('Failed to add supplier:', error);
    }
  };

  const supplyTypes: Array<{ value: 'commission' | 'cash' | 'credit'; label: string }> = [
    { value: 'commission', label: t('inventory.commission') },
    { value: 'cash', label: t('inventory.cashPurchase') },
    { value: 'credit', label: t('inventory.creditPurchase') },
  ];

  const handleTypeChange = (newType: string) => {
    const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
    const currentSupplierId = form.supplier_id;
    const isTradeSupplier = tradeSupplier && (currentSupplierId === tradeSupplier.id || currentSupplierId === 'trade');
    setForm({
      ...form,
      type: newType,
      supplier_id: newType === 'cash'
        ? (tradeSupplier?.id || 'trade')
        : (isTradeSupplier ? '' : currentSupplierId),
    });
  };

  const showCostColumn = form.type !== 'commission';
  const totalsList = Array.from(tally.totals.entries()).filter(([, amount]) => amount !== 0);

  // The translator does simple interpolation with no plural rules — pick the form here.
  const plural = (key: string, count: number) =>
    t(`inventory.receivePage.${key}${count === 1 ? 'One' : 'Many'}`, { count });

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      {/* Command bar — the batch can be committed from anywhere in a long manifest */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="h-1 bg-blue-600 dark:bg-blue-500" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <BackIcon className="h-4 w-4" />
            {t('inventory.receivePage.back')}
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {t('inventory.receiveProducts')}
            </h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {selectedSupplier
                ? `${selectedSupplier.name} · ${supplyTypes.find((s) => s.value === form.type)?.label ?? ''}`
                : t('inventory.receivePage.chooseSupplier')}
              {form.type === 'commission' && form.commission_rate ? ` · ${form.commission_rate}%` : ''}
            </p>
          </div>

          <div className="ms-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">{t('inventory.receivePage.billCurrency')}</span>
              <AcceptedCurrencySelect
                acceptedCurrencies={acList}
                value={batchCurrency}
                onChange={(currency) =>
                  setForm({
                    ...form,
                    porterage_currency: currency,
                    transfer_currency: currency,
                    plastic_currency: currency,
                  })
                }
                size="sm"
                aria-label={t('inventory.batchFeeCurrency')}
              />
            </label>
            <button
              type="submit"
              form="receive-products-form"
              disabled={loading || tally.lines === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-900"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t('inventory.receivePage.receiving')}
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" />
                  {tally.lines === 1
                    ? t('inventory.receivePage.receiveLine')
                    : t('inventory.receivePage.receiveLines', { count: tally.lines })}
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <form
        id="receive-products-form"
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col gap-6 p-6 lg:flex-row lg:items-start"
      >
        {/* Manifest */}
        <section className="min-w-0 flex-1">
          <div className="mb-3 flex items-baseline justify-between">
            <RailHeading>{t('inventory.receivePage.manifest')}</RailHeading>
            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {plural('lineCount', tally.lines)}
            </span>
          </div>

          {errors.form && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errors.form}</span>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {bulkProducts.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t('inventory.receivePage.emptyTitle')}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t('inventory.receivePage.emptyHint')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Min-width tracks the declared column widths, so the fields
                    scroll rather than getting crushed out of alignment. */}
                <table className={`w-full ${showCostColumn ? 'min-w-[1420px]' : 'min-w-[1180px]'}`}>
                  <thead>
                    <tr className="border-b border-slate-200 text-start dark:border-slate-800">
                      <th className={`w-10 text-start text-slate-400 dark:text-slate-500 ${headCellClass}`}>
                        <span className="sr-only">{t('inventory.receivePage.line')}</span>#
                      </th>
                      <th className={`w-[260px] text-start ${headCellClass}`}>{t('inventory.product')}</th>
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.qty')}</th>
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.unit')}</th>
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.weight')}</th>
                      {showCostColumn && (
                        <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.price')}</th>
                      )}
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.sellingPrice')}</th>
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.sellingPriceCurrency')}</th>
                      <th className={`${colFieldClass} text-start ${headCellClass}`}>{t('inventory.skuBarcode')}</th>
                      {showCostColumn && (
                        <th className={`w-28 text-end ${headCellClass}`}>{t('inventory.receivePage.lineValue')}</th>
                      )}
                      <th className="w-12 px-3 py-2.5">
                        <span className="sr-only">{t('inventory.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bulkProducts.map((productId, index) => {
                      const item = bulkItems[productId] || {
                        product_id: '', quantity: '', unit: defaultUnitCode, price: '', selling_price: '', weight: '', sku: '',
                      };
                      const lineCur = normalizeToAccepted(
                        item.price_currency || item.selling_price_currency,
                        acList,
                        batchCurrency
                      );
                      const lineSym = CURRENCY_META[lineCur]?.symbol ?? lineCur;
                      const product = products.find((p: any) => p.id === item.product_id);
                      const productName = product?.name || '';
                      const weightTracked = item.weight_tracked ?? isMassUnitCode(item.unit);
                      const lineValue = tally.lineValues.get(productId);

                      return (
                        <tr key={productId} className="align-top transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-3 text-sm tabular-nums text-slate-400 dark:text-slate-500">
                            {index + 1}
                          </td>

                          <td className="px-3 py-3">
                            <SearchableSelect
                              options={products.map((p: any) => ({
                                id: p.id,
                                label: getProductName(p),
                                value: p.id,
                                category: categoryLookup.label(p),
                              }))}
                              value={item.product_id || ''}
                              onChange={(value: any) => {
                                setBulkItems((prev) => ({
                                  ...prev,
                                  [productId]: { ...prev[productId], product_id: value as string, unit: prev[productId]?.unit || defaultUnitCode },
                                }));
                              }}
                              placeholder={t('inventory.selectProduct')}
                              searchPlaceholder={t('inventory.searchProducts')}
                              categories={activeCategoryLabels}
                              showAddOption={true}
                              addOptionText={t('inventory.addNewProduct')}
                              onAddNew={() => setAddProductForRow(productId)}
                              className="w-full"
                              portal={true}
                            />
                            {errors[`product_${productId}`] && (
                              <p className="mt-1 text-xs text-red-600">{errors[`product_${productId}`]}</p>
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], quantity: e.target.value },
                              }))}
                              className={`${cellFieldClass} ${errors[`quantity_${productId}`] ? errorFieldClass : ''}`}
                              min="1"
                              step="0.01"
                              placeholder="0"
                              aria-label={`${t('inventory.qty')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                            />
                            {errors[`quantity_${productId}`] && (
                              <p className="mt-1 text-xs text-red-600">{errors[`quantity_${productId}`]}</p>
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <select
                              value={item.unit}
                              onChange={(e) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], unit: e.target.value },
                              }))}
                              className={fieldClass}
                              aria-label={`${t('inventory.unit')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                            >
                              {activeUnits.length === 0 && <option value="" disabled>{t('app.loading')}</option>}
                              {activeUnits.length > 0 && !activeUnits.some((u) => u.code === item.unit) && item.unit && (
                                <option value={item.unit}>{item.unit}</option>
                              )}
                              {activeUnits.map((u) => (
                                <option key={u.id} value={u.code}>
                                  {getTranslatedString(u.name, language as 'en' | 'ar' | 'fr')}
                                  {u.symbol ? ` (${u.symbol})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={productName.toLowerCase() === 'plastic'}
                              value={item.weight || ''}
                              onChange={(e) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], weight: e.target.value },
                              }))}
                              className={`${cellFieldClass} disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/60 ${errors[`weight_${productId}`] ? errorFieldClass : ''}`}
                              placeholder={t('inventory.kg')}
                              aria-label={`${t('inventory.weight')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                            />
                            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5" title={t('losses.weightTrackedHint')}>
                              <input
                                type="checkbox"
                                checked={weightTracked}
                                onChange={(e) => setBulkItems((prev) => ({
                                  ...prev,
                                  [productId]: { ...prev[productId], weight_tracked: e.target.checked },
                                }))}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                              />
                              <span className="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">{t('losses.weightTracked')}</span>
                            </label>
                            {errors[`weight_${productId}`] && (
                              <p className="mt-1 text-xs text-red-600">{errors[`weight_${productId}`]}</p>
                            )}
                          </td>

                          {showCostColumn && (
                            <td className="px-3 py-3">
                              <MoneyInput
                                value={item.price || ''}
                                onChange={(value) => setBulkItems((prev) => ({
                                  ...prev,
                                  [productId]: { ...prev[productId], price: value },
                                }))}
                                prefix={lineSym}
                                placeholder="0"
                                ariaLabel={`${t('inventory.price')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                                className={`text-sm tabular-nums ${errors[`price_${productId}`] ? 'border-red-500 ring-red-500' : ''}`}
                              />
                              {errors[`price_${productId}`] && (
                                <p className="mt-1 text-xs text-red-600">{errors[`price_${productId}`]}</p>
                              )}
                            </td>
                          )}

                          <td className="px-3 py-3">
                            <MoneyInput
                              value={item.selling_price || ''}
                              onChange={(value) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], selling_price: value },
                              }))}
                              prefix={lineSym}
                              placeholder="0"
                              ariaLabel={`${t('inventory.sellingPrice')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                              className="text-sm tabular-nums"
                            />
                          </td>

                          <td className="px-3 py-3">
                            <AcceptedCurrencySelect
                              acceptedCurrencies={acList}
                              value={lineCur}
                              onChange={(currency) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], price_currency: currency, selling_price_currency: currency },
                              }))}
                              className="w-full h-11"
                              aria-label={t('inventory.lineItemCurrency')}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={item.sku || ''}
                              onChange={(e) => setBulkItems((prev) => ({
                                ...prev,
                                [productId]: { ...prev[productId], sku: e.target.value },
                              }))}
                              className={fieldClass}
                              placeholder={t('inventory.skuBarcode')}
                              aria-label={`${t('inventory.skuBarcode')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                            />
                          </td>

                          {showCostColumn && (
                            <td className="px-3 py-3 text-end">
                              {lineValue ? (
                                <>
                                  <span className="text-sm font-medium tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                                    {formatMoney(lineValue.value, lineValue.currency)}
                                  </span>
                                  {/* Only worth saying when both are filled — the service
                                      silently prices by weight and ignores the quantity. */}
                                  {Number(item.weight) > 0 && Number(item.quantity) > 0 && (
                                    <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                                      {t('inventory.receivePage.pricedByWeight')}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                          )}

                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => removeProductRow(productId)}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:hover:bg-red-950/40"
                              title={t('inventory.removeProduct')}
                              aria-label={`${t('inventory.removeProduct')} — ${t('inventory.receivePage.line')} ${index + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={addProductRow}
              className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-300 py-3.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
            >
              <Plus className="h-4 w-4" />
              {t('inventory.receivePage.addLine')}
            </button>
          </div>

          {errors.product_id && <p className="mt-2 text-xs text-red-600">{errors.product_id}</p>}
        </section>

        {/* Tally + terms rail */}
        <aside className="w-full shrink-0 space-y-5 lg:sticky lg:top-[73px] lg:w-[360px]">
          {/* The tally — what you are about to commit, checked against the driver's paper */}
          <div className="rounded-xl bg-blue-700 p-5 text-white shadow-sm dark:bg-blue-900">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200">
              {t('inventory.receivePage.onThisBill')}
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-3 border-b border-white/15 pb-4">
              <div>
                <p className="text-xl font-semibold tabular-nums tracking-tight">{formatNumber(tally.lines)}</p>
                <p className="text-[11px] text-blue-200">{t('inventory.receivePage.statLines')}</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums tracking-tight">{formatNumber(tally.units)}</p>
                <p className="text-[11px] text-blue-200">{t('inventory.receivePage.statUnits')}</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums tracking-tight">
                  {formatNumber(tally.weight, tally.weight % 1 === 0 ? 0 : 1)}
                </p>
                <p className="text-[11px] text-blue-200">{t('inventory.kg')}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              { (
                Array.from(tally.goods.entries()).map(([currency, amount]) => (
                  <div key={currency} className="flex items-baseline justify-between gap-3">
                    <dt className="text-blue-100">
                       {t('inventory.receivePage.goods')}
                      {tally.goods.size > 1 ? ` · ${currency}` : ''}
                    </dt>
                    <dd className="tabular-nums">{formatMoney(amount, currency)}</dd>
                  </div>
                ))
              )}

              {tally.porterage > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-blue-100">{t('receivedBills.porterage')}</dt>
                  <dd className="tabular-nums">{formatMoney(tally.porterage, batchCurrency)}</dd>
                </div>
              )}
              {tally.transfer > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-blue-100">{t('receivedBills.transferFee')}</dt>
                  <dd className="tabular-nums">{formatMoney(tally.transfer, batchCurrency)}</dd>
                </div>
              )}
              {tally.plastic > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-blue-100">{t('inventory.plasticMortgage')}</dt>
                  <dd className="tabular-nums">{formatMoney(tally.plastic, batchCurrency)}</dd>
                </div>
              )}
            </dl>

            {totalsList.length > 0 && (
              <div className="mt-4 border-t border-white/15 pt-4">
                {totalsList.map(([currency, amount], i) => (
                  <div key={currency} className={`flex items-baseline justify-between gap-3 ${i > 0 ? 'mt-2' : ''}`}>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200">
                      {i === 0 ? t('inventory.receivePage.total') : ''}
                      {totalsList.length > 1 ? ` ${currency}` : ''}
                    </span>
                    <span className="text-2xl font-semibold tabular-nums tracking-tight">
                      {formatMoney(amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tally.unpriced > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-amber-400/15 p-2.5 text-[13px] text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {plural('unpriced', tally.unpriced)}
              </p>
            )}
          </div>

          {/* Supplier & terms */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <RailHeading>{t('inventory.receivePage.termsHeading')}</RailHeading>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('inventory.supplyType')}
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {supplyTypes.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleTypeChange(option.value)}
                    aria-pressed={form.type === option.value}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      form.type === option.value
                        ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('inventory.supplierName')} *
              </label>
              {form.type === 'cash' ? (
                <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  {t('inventory.trade')}
                </div>
              ) : (
                <SearchableSelect
                  options={suppliers
                    .filter((supplier: any) => supplier.name !== 'Trade')
                    .map((supplier: any) => ({ id: supplier.id, label: supplier.name, value: supplier.id }))}
                  value={form.supplier_id}
                  onChange={(value: any) => setForm({ ...form, supplier_id: value })}
                  placeholder={t('customers.selectSupplier')}
                  searchPlaceholder={t('customers.searchSuppliers')}
                  recentSelections={recentSuppliers}
                  onRecentUpdate={setRecentSuppliers}
                  showAddOption={true}
                  addOptionText={t('customers.addNewSupplier')}
                  onAddNew={() => setShowSupplierModal(true)}
                  className={`w-full ${errors.supplier_id ? 'border-red-500 ring-red-500' : ''}`}
                  portal={true}
                />
              )}
              {errors.supplier_id && <p className="mt-1 text-xs text-red-600">{errors.supplier_id}</p>}
            </div>

            {form.type === 'commission' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('inventory.commissionRate')} (%) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.commission_rate}
                  onChange={(e) => setForm({ ...form, commission_rate: e.target.value.toString() })}
                  className={`${cellFieldClass} ${errors.commission_rate ? errorFieldClass : ''}`}
                  placeholder={`${t('inventory.default')}: ${defaultCommissionRate}%`}
                />
                {errors.commission_rate && <p className="mt-1 text-xs text-red-600">{errors.commission_rate}</p>}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('inventory.receivedDate')} *
              </label>
              <input
                type="date"
                value={form.received_at}
                onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                className={`${cellFieldClass} ${errors.received_at ? errorFieldClass : ''}`}
              />
              {errors.received_at && <p className="mt-1 text-xs text-red-600">{errors.received_at}</p>}
            </div>
          </div>

          {/* Fees */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <RailHeading>{t('inventory.receivePage.feesHeading')}</RailHeading>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <MoneyInput
                  value={form.porterage_fee}
                  onChange={(value) => setForm({ ...form, porterage_fee: value })}
                  label={t('receivedBills.porterage')}
                  prefix={CURRENCY_META[batchCurrency]?.symbol}
                  placeholder="0"
                  className={`tabular-nums ${errors.porterage_fee ? 'border-red-500 ring-red-500' : ''}`}
                />
                {errors.porterage_fee && <p className="mt-1 text-xs text-red-600">{errors.porterage_fee}</p>}
              </div>
              <div>
                <MoneyInput
                  value={form.transfer_fee}
                  onChange={(value) => setForm({ ...form, transfer_fee: value })}
                  label={t('receivedBills.transferFee')}
                  prefix={CURRENCY_META[batchCurrency]?.symbol}
                  placeholder="0"
                  className={`tabular-nums ${errors.transfer_fee ? 'border-red-500 ring-red-500' : ''}`}
                />
                {errors.transfer_fee && <p className="mt-1 text-xs text-red-600">{errors.transfer_fee}</p>}
              </div>
            </div>

            {form.type === 'commission' && (
              <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.empty_plastic}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setForm({
                        ...form,
                        empty_plastic: isChecked,
                        plastic_count: isChecked ? form.plastic_count : '',
                        plastic_price: isChecked ? form.plastic_price : '',
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('inventory.plasticMortgage')}
                    {!form.empty_plastic && (
                      <span className="ms-1 font-normal text-slate-400">({t('common.placeholders.optional')})</span>
                    )}
                  </span>
                </label>

                {form.empty_plastic && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('inventory.plasticNumber')} *
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.plastic_count}
                        onChange={(e) => setForm({ ...form, plastic_count: e.target.value })}
                        placeholder="0"
                        className={`${cellFieldClass} ${errors.plastic_count ? errorFieldClass : ''}`}
                      />
                      {errors.plastic_count && <p className="mt-1 text-xs text-red-600">{errors.plastic_count}</p>}
                    </div>
                    <div>
                      <MoneyInput
                        value={form.plastic_price}
                        onChange={(value) => setForm({ ...form, plastic_price: value })}
                        prefix={CURRENCY_META[normalizeToAccepted(form.plastic_currency, acList, batchCurrency)]?.symbol}
                        label={`${t('inventory.plasticPrice')} *`}
                        placeholder="0"
                        required
                        className={`tabular-nums ${errors.plastic_price ? 'border-red-500 ring-red-500' : ''}`}
                      />
                      {errors.plastic_price && <p className="mt-1 text-xs text-red-600">{errors.plastic_price}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <RailHeading>{t('inventory.notes')}</RailHeading>
            <div className="relative">
              <textarea
                ref={notesTextareaRef}
                value={form.status}
                onChange={handleNotesChange}
                onFocus={() => refreshSuggestions(form.status || '')}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder={t('inventory.addAnyAdditionalStatusOrComments')}
              />
              {showSuggestions && notesSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                >
                  {notesSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full border-b border-slate-100 px-3 py-2 text-start text-sm text-slate-700 last:border-b-0 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.status && form.status.trim() && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showAsTag}
                  onChange={(e) => setShowAsTag(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{t('inventory.showAsTagInPOSPage')}</span>
              </label>
            )}
          </div>
        </aside>
      </form>

      {addSupplier && (
        <SupplierFormModal
          open={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSuccess={handleAddSupplier}
          existingSuppliers={suppliers}
        />
      )}

      <AddProductModal
        open={!!addProductForRow}
        onClose={() => setAddProductForRow(null)}
        onSuccess={async (data: any) => {
          const row = addProductForRow;
          await addProduct(data);
          await refreshData();
          if (row && typeof data?.name === 'string') setPendingProduct({ row, name: data.name });
        }}
      />

      {discardPrompt && (
        <div className="animate-modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-manifest-title"
            className="animate-modal-pop w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10"
          >
            <h2 id="discard-manifest-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('inventory.receivePage.discardTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {plural('discardBody', enteredLines)}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={keepEditingRef}
                type="button"
                onClick={cancelDiscard}
                className="h-9 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('inventory.receivePage.keepEditing')}
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="h-9 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                {t('inventory.receivePage.discardAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiveProductsView;
