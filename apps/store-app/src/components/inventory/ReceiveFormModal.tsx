import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, X, Package, Coins, FileText, Truck, AlertTriangle, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { inventoryPurchaseService } from '../../services/inventoryPurchaseService';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { normalizeNameForComparison } from '../../utils/nameNormalization';

function normalizeToAccepted(value: unknown, accepted: CurrencyCode[], fallback: CurrencyCode): CurrencyCode {
  if (typeof value === 'string' && (accepted as string[]).includes(value)) return value as CurrencyCode;
  return fallback;
}

function currencyLabel(t: (k: string) => string, code: CurrencyCode): string {
  const key = `common.currency.${code}`;
  const tr = t(key);
  return tr !== key ? tr : CURRENCY_META[code]?.code ?? code;
}

/** Money for read-only display. Symbol leads, matching the MoneyInput prefixes. */
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

// Same column rhythm as ReceiveProductsView: one width for every data-entry
// column, with the product picker and the action buttons outside it.
const colFieldClass = 'w-36';
const headCellClass = 'px-2 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

// Heights match MoneyInput's 44px so money and plain fields line up across a
// row — the same field tokens the full-page receive view uses.
const fieldClass =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const cellFieldClass =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

const errorFieldClass = 'border-red-500 focus:border-red-500 focus:ring-red-500/25';

// MoneyInput ships light-only field colours; these ride in through its
// className so money and plain fields match in dark mode too.
const moneyFieldClass =
  'text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

/** Column heading register, reused for the footer tally labels. */
const microHeadingClass = 'text-[11px] font-semibold uppercase tracking-[0.16em]';

// Supply type is the fact that changes how every other number on this form is
// read, so it carries a colour — the context dot and its chip agree.
const TYPE_STYLES: Record<string, { dot: string; chip: string }> = {
  cash: { dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  credit: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  commission: { dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

const contextChipClass =
  'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300';

const SectionHeading: React.FC<{ icon: LucideIcon; tint: string; children: React.ReactNode }> = ({
  icon: Icon,
  tint,
  children,
}) => (
  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
    <Icon className={`h-4 w-4 shrink-0 ${tint}`} aria-hidden="true" />
    {children}
  </h3>
);

const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
    {children}
  </label>
);

/** One reading in the footer tally. */
const Stat: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-baseline gap-1.5">
    <dt className={`${microHeadingClass} text-slate-400 dark:text-slate-500`}>{label}</dt>
    <dd className={`tabular-nums tracking-tight text-slate-900 dark:text-slate-100 ${strong ? 'text-base font-semibold' : 'text-sm font-semibold'}`}>
      {value}
    </dd>
  </div>
);

interface ReceiveFormModalProps {
  open: boolean;
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
  // Edit mode props
  isEditMode?: boolean;
  editingBatchId?: string | null;
  existingBatchItems?: any[];
}

const ReceiveFormModal: React.FC<ReceiveFormModalProps> = ({
  open,
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
  isEditMode = false,
  editingBatchId = null,
  existingBatchItems = [],
}) => {
  const [loading, setLoading] = useState(false);
  const [bulkProducts, setBulkProducts] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<Record<string, {
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
  }>>({});
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  // Which line asked for a brand-new product, and the name it is waiting on.
  const [addProductForRow, setAddProductForRow] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<{ row: string; name: string } | null>(null);
  const [originalFormValues, setOriginalFormValues] = useState<any>(null);
  const modalInstanceRef = useRef<number>(0);
  const [showAsTag, setShowAsTag] = useState(true);
  const [notesSuggestions, setNotesSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  // The body scrolls independently of the pinned header/footer, so a failed
  // submit has to bring the summary back into view itself.
  const bodyRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { t, language } = useI18n();
  const { units, categories, addProduct, refreshData } = useOfflineData();
  const categoryLookup = useCategoryLookup();
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
  // Base currency for the batch fees — porterage carries it, transfer and
  // plastic follow unless they were set to something else.
  const feeCurrency = normalizeToAccepted(form.porterage_currency, acList, preferredCurrency);

  // // Auto-focus first field when modal opens
  // useEffect(() => {
  //   if (open && firstInputRef.current) firstInputRef.current.focus();
  // }, [open]);

  // Add default product row when modal opens - handled in the main useEffect below

  // Reset state when modal closes and increment instance counter
  useEffect(() => {
    if (!open) {
      setBulkProducts([]);
      setBulkItems({});
      setErrors({});
      setOriginalFormValues(null);
      setShowAsTag(false);
      setNotesSuggestions([]);
      setShowSuggestions(false);
      modalInstanceRef.current += 1; // Force new instance
    }
  }, [open]);

  // Set today's date and auto-set currencies when modal opens
  useEffect(() => {
    if (open) {
      const today = getTodayLocalDate();
      const updates: any = {};
      
      if (form.received_at !== today) {
        updates.received_at = today;
      }
      
      const feeBase = normalizeToAccepted(form.porterage_currency, acList, preferredCurrency);
      if (form.porterage_currency !== feeBase) updates.porterage_currency = feeBase;
      const xfer = normalizeToAccepted(form.transfer_currency, acList, feeBase);
      if (form.transfer_currency !== xfer) updates.transfer_currency = xfer;
      const plas = normalizeToAccepted(form.plastic_currency, acList, feeBase);
      if (form.plastic_currency !== plas) updates.plastic_currency = plas;
      
      // Ensure Trade supplier is set for cash purchases
      if (form.type === 'cash') {
        const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
        if (tradeSupplier && form.supplier_id !== tradeSupplier.id) {
          updates.supplier_id = tradeSupplier.id;
        }
      }
      
      // Clear Trade supplier if type is commission (Trade cannot be used for commission)
      if (form.type === 'commission') {
        const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
        if (tradeSupplier && (form.supplier_id === tradeSupplier.id || form.supplier_id === 'trade')) {
          updates.supplier_id = '';
        }
      }
      
      if (Object.keys(updates).length > 0) {
        setForm({ ...form, ...updates });
      }
    }
  }, [open, suppliers, form.type, preferredCurrency, acceptedCurrencies, form.porterage_currency, form.transfer_currency, form.plastic_currency, setForm, form, acList]);

  // Capture original form values when modal opens in edit mode
  useEffect(() => {
    if (open && isEditMode && !originalFormValues) {
      setOriginalFormValues({ ...form });
    } else if (!open) {
      setOriginalFormValues(null);
    }
  }, [open, isEditMode, form, originalFormValues]);

  // Populate existing batch items when in edit mode
  useEffect(() => {
    if (open && isEditMode && existingBatchItems.length > 0) {
      const newBulkProducts: string[] = [];
      const newBulkItems: Record<string, any> = {};
      
      existingBatchItems.forEach((item, index) => {
        // Use item.id if available, otherwise use index with timestamp to ensure uniqueness
        const productId = item.id ? `edit_${item.id}` : `edit_${index}_${Date.now()}`;
        newBulkProducts.push(productId);
        const ic = normalizeToAccepted((item as any).currency, acList, preferredCurrency);
        newBulkItems[productId] = {
          product_id: item.product_id || '',
          quantity: (item.received_quantity || item.quantity || '').toString(),
          unit: item.unit || defaultUnitCode,
          price: item.price ? item.price.toString() : '',
          selling_price: item.selling_price ? item.selling_price.toString() : '',
          weight: item.weight ? item.weight.toString() : '',
          sku: (item as any).sku || '',
          price_currency: ic,
          selling_price_currency: ic,
        };
      });

      
      setBulkProducts(newBulkProducts);
      setBulkItems(newBulkItems);
    } else if (open && !isEditMode && bulkProducts.length === 0) {
      // Only add default product row for new entries
      addProductRow();
    }
  }, [open, isEditMode, existingBatchItems, acceptedCurrencies, preferredCurrency, acList]);

  // Keyboard support — Escape closes, Ctrl/Cmd+Enter commits from any field
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        if (showSuggestions) {
          setShowSuggestions(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, showSuggestions]);

  // The page behind a modal should not scroll under the pointer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Handle notes field focus - show suggestions
  const handleNotesFocus = () => {
    const currentNote = form.status || '';
    
    // Get selected product IDs
    const selectedProductIds = bulkProducts
      .map(pid => bulkItems[pid]?.product_id)
      .filter(Boolean) as string[];
    
    if (!currentNote.trim()) {
      // Show last 3 notes if field is empty
      // If product is selected, show notes for that specific product only
      if (selectedProductIds.length > 0) {
        const lastThree = getLastThreeNotes(selectedProductIds[0]);
        setNotesSuggestions(lastThree);
        setShowSuggestions(lastThree.length > 0);
      } else {
        // No product selected, show last 3 from all products
        const lastThree = getLastThreeNotes();
        setNotesSuggestions(lastThree);
        setShowSuggestions(lastThree.length > 0);
      }
    } else {
      // Show matching notes for selected products
      if (selectedProductIds.length > 0) {
        // Use the first selected product for matching
        const matching = getMatchingNotes(selectedProductIds[0], currentNote);
        setNotesSuggestions(matching);
        setShowSuggestions(matching.length > 0);
      } else {
        // If no product selected, show matching notes from all products
        const allNotes = getAllNotes();
        const searchLower = currentNote.toLowerCase().trim();
        const matching = allNotes
          .filter(note => note.note.toLowerCase().includes(searchLower))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map(n => n.note);
        
        // Remove duplicates
        const uniqueMatching = Array.from(new Set(matching));
        setNotesSuggestions(uniqueMatching);
        setShowSuggestions(uniqueMatching.length > 0);
      }
    }
  };

  // Handle notes field change - update suggestions
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm({ ...form, status: value });
    
    // Get selected product IDs
    const selectedProductIds = bulkProducts
      .map(pid => bulkItems[pid]?.product_id)
      .filter(Boolean) as string[];
    
    if (!value.trim()) {
      // Show last 3 notes if field is empty
      // If product is selected, show notes for that specific product only
      if (selectedProductIds.length > 0) {
        const lastThree = getLastThreeNotes(selectedProductIds[0]);
        setNotesSuggestions(lastThree);
        setShowSuggestions(lastThree.length > 0);
      } else {
        // No product selected, show last 3 from all products
        const lastThree = getLastThreeNotes();
        setNotesSuggestions(lastThree);
        setShowSuggestions(lastThree.length > 0);
      }
    } else {
      // Show matching notes for selected products
      if (selectedProductIds.length > 0) {
        // Use the first selected product for matching
        const matching = getMatchingNotes(selectedProductIds[0], value);
        setNotesSuggestions(matching);
        setShowSuggestions(matching.length > 0);
      } else {
        // If no product selected, show matching notes from all products
        const allNotes = getAllNotes();
        const searchLower = value.toLowerCase().trim();
        const matching = allNotes
          .filter(note => note.note.toLowerCase().includes(searchLower))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map(n => n.note);
        
        // Remove duplicates
        const uniqueMatching = Array.from(new Set(matching));
        setNotesSuggestions(uniqueMatching);
        setShowSuggestions(uniqueMatching.length > 0);
      }
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setForm({ ...form, status: suggestion });
    setShowSuggestions(false);
    notesTextareaRef.current?.focus();
  };

  // Close suggestions when clicking outside
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

  // Update suggestions when products are selected/changed (if notes field has focus)
  useEffect(() => {
    if (notesTextareaRef.current === document.activeElement) {
      const currentNote = form.status || '';
      const selectedProductIds = bulkProducts
        .map(pid => bulkItems[pid]?.product_id)
        .filter(Boolean) as string[];
      
      if (!currentNote.trim()) {
        // Show last 3 notes for selected product
        if (selectedProductIds.length > 0) {
          const lastThree = getLastThreeNotes(selectedProductIds[0]);
          setNotesSuggestions(lastThree);
          setShowSuggestions(lastThree.length > 0);
        } else {
          const lastThree = getLastThreeNotes();
          setNotesSuggestions(lastThree);
          setShowSuggestions(lastThree.length > 0);
        }
      } else if (selectedProductIds.length > 0) {
        // Update matching notes for the selected product
        const matching = getMatchingNotes(selectedProductIds[0], currentNote);
        setNotesSuggestions(matching);
        setShowSuggestions(matching.length > 0);
      }
    }
  }, [bulkProducts, bulkItems, form.status]);

  const { getProductName } = useProductMultilingual();
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();

  // addProduct writes to Dexie but doesn't push into context state — the new
  // product only reaches `products` on the next rehydration. Watch for it by
  // name and drop it into the line that asked for it.
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

  // Get selected supplier for context display
  const selectedSupplier = form.type === 'cash'
    ? suppliers.find((s: any) => s.name === 'Trade') || { name: t('inventory.trade'), id: 'trade' }
    : suppliers.find((s: any) => s.id === form.supplier_id) || null;

  /**
   * Running tally, so the batch can be checked against the driver's paper
   * without leaving the modal. Line value mirrors
   * inventoryPurchaseService.calculatePurchaseAmounts: weight × price when a
   * weight is present, otherwise quantity × price.
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
        feeCurrency
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
    if (feeTotal > 0) totals.set(feeCurrency, (totals.get(feeCurrency) ?? 0) + feeTotal);

    return { lines: bulkProducts.length, units, weight, unpriced, lineValues, totals };
  }, [
    bulkProducts,
    bulkItems,
    form.type,
    form.porterage_fee,
    form.transfer_fee,
    form.empty_plastic,
    form.plastic_count,
    form.plastic_price,
    acList,
    feeCurrency,
  ]);

  // The translator does simple interpolation with no plural rules — pick the form here.
  const plural = (key: string, count: number) =>
    t(`inventory.receivePage.${key}${count === 1 ? 'One' : 'Many'}`, { count });

  // Enhanced validation with comprehensive field checking
  const validate = () => {
    const errors: any = {};

    // Supplier validation - required for credit and commission purchases
    if (form.type === 'commission' || form.type === 'credit') {
      if (!form.supplier_id) {
        errors.supplier_id = `${t('inventory.supplierRequiredForCommissionPurchases')}`;
      } else {
        // Check if Trade supplier is being used for commission/credit (not allowed)
        const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
        if (tradeSupplier && form.supplier_id === tradeSupplier.id) {
          errors.supplier_id = `${t('inventory.pleaseSelectADifferentSupplier')}`;
        } else if (form.supplier_id === 'trade') {
          errors.supplier_id = `${t('inventory.pleaseSelectADifferentSupplier')}`;
        }
      }
    }
    if (form.type === 'credit' && !form.supplier_id) {
      errors.supplier_id = `${t('inventory.supplierRequiredForCreditPurchases')}`;
    }
    
    if (!bulkProducts || bulkProducts.length === 0) {
      errors.product_id = 'Select at least one product.';
    } else {
      for (const pid of bulkProducts) {
        const item = bulkItems[pid];
        if (!item || !item.product_id) {
          errors[`product_${pid}`] = `${t('inventory.selectProduct')}`;
        }
        if (!item || !item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) < 1) {
          errors[`quantity_${pid}`] = `${t('inventory.quantityMustBeAtLeast1')}`;
        }

        // Weight-tracked lots must have a received weight (> 0). Existing rows in
        // edit mode are skipped — items are not re-persisted on batch edit.
        const isExistingRow = isEditMode && pid.startsWith('edit_');
        const rowWeightTracked = item ? (item.weight_tracked ?? isMassUnitCode(item.unit)) : false;
        if (!isExistingRow && rowWeightTracked && (!item?.weight || isNaN(Number(item.weight)) || Number(item.weight) <= 0)) {
          errors[`weight_${pid}`] = `${t('losses.weightRequired')}`;
        }

        // Cash purchase validation - requires price and either weight or unit quantity
        if (form.type === 'cash') {
          if (!item || !item.price || isNaN(Number(item.price)) || Number(item.price) <= 0) {
            errors[`price_${pid}`] = `${t('inventory.priceRequiredForCashPurchases')}`;
          }
          // For cash purchases, we need either weight or unit quantity to calculate total value
          if (!item.weight && !item.quantity) {
            errors[`quantity_${pid}`] = `${t('inventory.bothWeightOrQuantityIsRequiredForCashPurchases')}`;
          }
        }
        
        // Credit purchase validation - requires valid supplier, price is optional (can be set later)
        if (form.type === 'credit') {
          if (!form.supplier_id) {
            errors.supplier_id = `${t('inventory.supplierRequiredForCreditPurchases')}`;
          }
          // Price is optional for credit purchases - can be set later in non-priced items page
        }
      }
    }
    
    if (form.empty_plastic) {
      if (form.plastic_price <= 0 || form.plastic_price === undefined || isNaN(Number(form.plastic_price))) {
        errors.plastic_price = `${t('inventory.plasticPriceRequiredWhenPlasticMortgageIsChecked')}`;
      }
      else    if (form.plastic_count <= 0 || form.plastic_count === undefined || isNaN(Number(form.plastic_count))) {
        errors.plastic_count = `${t('inventory.plasticCountRequiredWhenPlasticMortgageIsChecked')}`;
      }
    }
    if (form.empty_plastic) {
   
    }
    
    // Received date validation
    if (!form.received_at) {
      errors.received_at = `${t('inventory.receivedDateRequired')}`;
    } else {
      const receivedDate = new Date(form.received_at);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // Set to end of today
      if (receivedDate > today) {
        errors.received_at = `${t('inventory.receivedDateCannotBeInTheFuture')}`;
      }
    }
    
    // Fees validation applies once per batch
    if (form.porterage_fee && (isNaN(Number(form.porterage_fee)) || Number(form.porterage_fee) < 0)) errors.porterage_fee = `${t('inventory.porterageFeeMustBeAPositiveNumber')}`;
    if (form.transfer_fee && (isNaN(Number(form.transfer_fee)) || Number(form.transfer_fee) < 0)) errors.transfer_fee = `${t('inventory.transferFeeMustBeAPositiveNumber')}`;
    if (form.type === 'commission') {
      if (!form.commission_rate || isNaN(Number(form.commission_rate)) || Number(form.commission_rate) < 0) errors.commission_rate = `${t('inventory.commissionRateMustBeAPercentage')}`;
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Row errors can sit below the fold in a long manifest — send the user
      // back to the summary rather than leaving the button looking inert.
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    try {
      const batchCurrency = normalizeToAccepted(form.porterage_currency, acList, preferredCurrency);
      const items = bulkProducts.map(pid => {
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

      // Cash drawer balance validation removed - negative balances are now allowed
        
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
          items
        }
      });

      // Save tags if checkbox is checked and notes are provided
      if (showAsTag && form.status && form.status.trim()) {
        bulkProducts.forEach(pid => {
          const bi = bulkItems[pid];
          if (bi.product_id) {
            saveProductTag(bi.product_id, form.status);
          }
        });
      }

      // Always save note for autocomplete suggestions
      if (form.status && form.status.trim()) {
        // Save note for each product in the batch
        bulkProducts.forEach(pid => {
          const bi = bulkItems[pid];
          if (bi.product_id) {
            saveNote(form.status, bi.product_id);
          }
        });
      }

      // Reset form after successful submission - preserve supplier selection
      const feeReset = normalizeToAccepted(preferredCurrency, acList, preferredCurrency);
      setForm({
        supplier_id: form.supplier_id, // Preserve current supplier selection
        type: form.type, // Preserve current type
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
        received_at: getTodayLocalDate() // Today's date in YYYY-MM-DD format
      });
      setBulkProducts([]);
      setBulkItems({});
      setErrors({});
      setShowAsTag(false);
      setNotesSuggestions([]);
      setShowSuggestions(false);
      onClose();
    } catch (e) {
      // Log the actual error for debugging
      console.error('[RECEIVE_FORM_MODAL] Error receiving inventory:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorStack = e instanceof Error ? e.stack : undefined;
      
      console.error('[RECEIVE_FORM_MODAL] Error details:', {
        message: errorMessage,
        stack: errorStack,
        error: e
      });
      
      // Check if error is related to insufficient balance
      if (errorMessage.includes('Insufficient cash drawer balance') || errorMessage.includes('insufficient')) {
        // Try to extract balance info from error message
        // Error format: "Insufficient cash drawer balance. Current balance: X, Required: Y"
        const balanceMatch = errorMessage.match(/Current balance:\s*([^,]+),\s*Required:\s*(.+)/);
        if (balanceMatch && balanceMatch.length >= 3) {
          const currentBalance = balanceMatch[1].trim();
          const requiredAmount = balanceMatch[2].trim();
          setErrors({ 
            form: t('inventory.insufficientCashDrawerBalance', { 
              currentBalance, 
              requiredAmount 
            }) 
          });
        } else {
          // Fallback: use error message as-is or generic message
          setErrors({ form: errorMessage || t('inventory.insufficientCashDrawerBalance', { currentBalance: '', requiredAmount: '' }) });
        }
      } else {
        // Show the actual error message instead of generic message
        setErrors({ form: `${t('inventory.failedToReceiveInventory')}: ${errorMessage}` });
      }
    }
    setLoading(false);
  };

  // Function to add a new product row
  const addProductRow = () => {
    // Use a more robust key generation to avoid duplicates
    // Combine timestamp, random number, and current array length for absolute uniqueness
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const arrayLength = bulkProducts.length;
    const newProductId = `new_${timestamp}_${randomSuffix}_${arrayLength}`;
    setBulkProducts(prev => [...prev, newProductId]);
    const rowCur = normalizeToAccepted(preferredCurrency, acList, preferredCurrency);
    setBulkItems(prev => ({
      ...prev,
      [newProductId]: {
        product_id: '',
        quantity: '',
        unit: defaultUnitCode,
        price: '',
        price_currency: rowCur,
        selling_price: '', 
        selling_price_currency: rowCur,
        weight: '' 
      }
    }));
  };

  // Function to remove a product row
  const removeProductRow = (productId: string) => {
    setBulkProducts(prev => prev.filter(id => id !== productId));
    setBulkItems(prev => {
      const newItems = { ...prev };
      delete newItems[productId];
      return newItems;
    });
  };

  // Handle adding new supplier
  const handleAddSupplier = async (supplierData: any) => {
    if (!addSupplier) {
      console.error('addSupplier function not provided');
      return;
    }

    try {
      await addSupplier(supplierData);
      setShowSupplierModal(false);
      // The parent component should refresh the suppliers list
    } catch (error) {
      console.error('Failed to add supplier:', error);
    }
  };

  // Check if there are any changes from the original values
  const hasChanges = () => {
    if (!isEditMode || !originalFormValues) {
      return true; // Allow submission for new items
    }

    // Compare key form fields that can be edited
    const fieldsToCompare = [
      'supplier_id',
      'type',
      'porterage_fee',
      'transfer_fee',
      'commission_rate',
      'status',
      'empty_plastic',
      'plastic_count',
      'plastic_price',
      'received_at'
    ];

    for (const field of fieldsToCompare) {
      const currentValue = form[field];
      const originalValue = originalFormValues[field];
      
      // Handle different data types
      if (field === 'empty_plastic') {
        if (!!currentValue !== !!originalValue) {
          return true;
        }
      } else if (field === 'commission_rate') {
        const currentNum = currentValue ? parseFloat(currentValue) : null;
        const originalNum = originalValue ? parseFloat(originalValue) : null;
        if (currentNum !== originalNum) {
          return true;
        }
      } else {
        // String comparison
        const currentStr = currentValue ? currentValue.toString() : '';
        const originalStr = originalValue ? originalValue.toString() : '';
        if (currentStr !== originalStr) {
          return true;
        }
      }
    }

    return false; // No changes detected
  };

  const handleTypeChange = (newType: string) => {
    const tradeSupplier = suppliers.find((s: any) => s.name === 'Trade');
    const currentSupplierId = form.supplier_id;
    const isTradeSupplier = tradeSupplier && (currentSupplierId === tradeSupplier.id || currentSupplierId === 'trade');
    setForm({
      ...form,
      type: newType,
      // cash always books against Trade; the other two never can.
      supplier_id: newType === 'cash'
        ? (tradeSupplier?.id || 'trade')
        : (isTradeSupplier ? '' : currentSupplierId),
    });
  };

  const supplyTypes: Array<{ value: 'commission' | 'cash' | 'credit'; label: string }> = [
    { value: 'commission', label: t('inventory.commission') },
    { value: 'cash', label: t('inventory.cashPurchase') },
    { value: 'credit', label: t('inventory.creditPurchase') },
  ];

  if (!open) return null;

  const showCostColumn = form.type !== 'commission';
  const totalsList = Array.from(tally.totals.entries()).filter(([, amount]) => amount !== 0);
  const fieldErrorCount = Object.keys(errors || {}).filter((key) => key !== 'form').length;
  const changesPending = hasChanges();
  const typeStyle = TYPE_STYLES[form.type] ?? TYPE_STYLES.commission;
  const typeLabel = form.type === 'cash'
    ? t('inventory.cashPurchase')
    : form.type === 'credit'
      ? t('inventory.creditPurchase')
      : `${t('inventory.commission')}${form.commission_rate ? `: ${form.commission_rate}%` : ''}`;

  return (
    <div className="animate-modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-batch-title"
        className="animate-modal-pop flex max-h-[92vh] w-full max-w-[1560px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10"
      >
        {/* Batch identity and terms stay pinned while the manifest scrolls */}
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 dark:border-slate-800 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="receive-batch-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {isEditMode ? t('inventory.editBatch') : t('inventory.receiveProducts')}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {isEditMode
                  ? t('inventory.updateBatchInformationAndInventoryItems')
                  : t('inventory.addNewInventoryItemsToYourStock')}
              </p>
              {isEditMode && editingBatchId && (
                <span
                  title={editingBatchId}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  {t('inventory.editBatch')}
                  <span className="font-mono tabular-nums opacity-75">{editingBatchId.slice(0, 8)}</span>
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="hidden sm:inline">{t('inventory.receivePage.billCurrency')}</span>
                <AcceptedCurrencySelect
                  acceptedCurrencies={acList}
                  value={feeCurrency}
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
                type="button"
                onClick={onClose}
                aria-label={t('inventory.cancel')}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Terms recap — how this batch will be booked */}
          {selectedSupplier && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <span className={`h-2 w-2 shrink-0 rounded-full ${typeStyle.dot}`} aria-hidden="true" />
              <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedSupplier.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeStyle.chip}`}>{typeLabel}</span>
              {form.porterage_fee && (
                <span className={contextChipClass}>
                  {t('receivedBills.porterage')}: {form.porterage_fee} {currencyLabel(t, feeCurrency)}
                </span>
              )}
              {form.transfer_fee && (
                <span className={contextChipClass}>
                  {t('receivedBills.transferFee')}: {form.transfer_fee}{' '}
                  {currencyLabel(t, normalizeToAccepted(form.transfer_currency, acList, feeCurrency))}
                </span>
              )}
            </div>
          )}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {/* One place to look after a rejected submit */}
            {(errors.form || fieldErrorCount > 0) && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.form || plural('fixFields', fieldErrorCount)}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Supplier */}
              <div>
                <div className="mb-4">
                  <SectionHeading icon={Package} tint="text-blue-600 dark:text-blue-400">
                    {t('inventory.supplierInformation')}
                  </SectionHeading>
                </div>

                <div className="space-y-4">
                  <div>
                    <FieldLabel>{t('inventory.supplierName')} *</FieldLabel>
                    {form.type === 'cash' ? (
                      <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {t('inventory.trade')} ({t('inventory.cashPurchase')})
                      </div>
                    ) : (
                      <SearchableSelect
                        options={suppliers
                          .filter((supplier: any) => supplier.name !== 'Trade')
                          .map((supplier: any) => ({
                            id: supplier.id,
                            label: supplier.name,
                            value: supplier.id,
                          }))}
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

                  {/* All three terms visible at once — the choice rewrites the
                      rest of the form, so it should not hide in a dropdown. */}
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('inventory.supplyType')} *
                    </span>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                      {supplyTypes.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleTypeChange(option.value)}
                          aria-pressed={form.type === option.value}
                          className={`rounded-md px-2 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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
                </div>
              </div>

              {/* Money */}
              <div>
                <div className="mb-4">
                  <SectionHeading icon={Coins} tint="text-purple-600 dark:text-purple-400">
                    {t('inventory.financialInformation')}
                  </SectionHeading>
                </div>

                <div className="space-y-4">
                  {form.type === 'commission' && (
                    <div>
                      <FieldLabel htmlFor="receive-commission-rate">
                        {t('inventory.commissionRate')} (%) *
                      </FieldLabel>
                      <input
                        id="receive-commission-rate"
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

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <MoneyInput
                        value={form.porterage_fee}
                        onChange={(value) => setForm({ ...form, porterage_fee: value })}
                        label={t('inventory.porterageFee')}
                        prefix={CURRENCY_META[feeCurrency]?.symbol}
                        placeholder="0"
                        className={`${moneyFieldClass} ${errors.porterage_fee ? errorFieldClass : ''}`}
                      />
                      {errors.porterage_fee && <p className="mt-1 text-xs text-red-600">{errors.porterage_fee}</p>}
                    </div>

                    <div>
                      <MoneyInput
                        value={form.transfer_fee}
                        onChange={(value) => setForm({ ...form, transfer_fee: value })}
                        label={t('inventory.transferFee')}
                        prefix={CURRENCY_META[normalizeToAccepted(form.transfer_currency, acList, feeCurrency)]?.symbol}
                        placeholder="0"
                        className={`${moneyFieldClass} ${errors.transfer_fee ? errorFieldClass : ''}`}
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
                            <span className="ms-1 font-normal text-slate-400 dark:text-slate-500">
                              ({t('common.placeholders.optional')})
                            </span>
                          )}
                        </span>
                      </label>

                      {form.empty_plastic && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <FieldLabel htmlFor="receive-plastic-count">{t('inventory.plasticNumber')} *</FieldLabel>
                            <input
                              id="receive-plastic-count"
                              type="number"
                              min="0"
                              value={form.plastic_count}
                              onChange={(e) => setForm({ ...form, plastic_count: e.target.value })}
                              placeholder={t('inventory.numberOfPlastics')}
                              className={`${cellFieldClass} ${errors.plastic_count ? errorFieldClass : ''}`}
                            />
                            {errors.plastic_count && <p className="mt-1 text-xs text-red-600">{errors.plastic_count}</p>}
                          </div>
                          <div>
                            <MoneyInput
                              value={form.plastic_price}
                              onChange={(value) => setForm({ ...form, plastic_price: value })}
                              prefix={CURRENCY_META[normalizeToAccepted(form.plastic_currency, acList, feeCurrency)]?.symbol}
                              label={`${t('inventory.plasticPrice')} *`}
                              placeholder="0"
                              required
                              className={`${moneyFieldClass} ${errors.plastic_price ? errorFieldClass : ''}`}
                            />
                            {errors.plastic_price && <p className="mt-1 text-xs text-red-600">{errors.plastic_price}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Date & notes */}
              <div>
                <div className="mb-4">
                  <SectionHeading icon={FileText} tint="text-orange-600 dark:text-orange-400">
                    {t('inventory.additionalInformation')}
                  </SectionHeading>
                </div>

                <div className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="receive-date">{t('inventory.receivedDate')} *</FieldLabel>
                    <input
                      id="receive-date"
                      type="date"
                      value={form.received_at}
                      onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                      className={`${cellFieldClass} ${errors.received_at ? errorFieldClass : ''}`}
                    />
                    {errors.received_at && <p className="mt-1 text-xs text-red-600">{errors.received_at}</p>}
                  </div>

                  <div className="relative">
                    <FieldLabel htmlFor="receive-notes">{t('inventory.notes')}</FieldLabel>
                    <textarea
                      id="receive-notes"
                      ref={notesTextareaRef}
                      value={form.status}
                      onChange={handleNotesChange}
                      onFocus={handleNotesFocus}
                      rows={4}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder={t('inventory.addAnyAdditionalStatusOrComments')}
                    />
                    {showSuggestions && notesSuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
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
                    {form.status && form.status.trim() && (
                      <label className="mt-2 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={showAsTag}
                          onChange={(e) => setShowAsTag(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {t('inventory.showAsTagInPOSPage')}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Manifest */}
            <div className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <SectionHeading icon={Truck} tint="text-emerald-600 dark:text-emerald-400">
                  {t('inventory.products')}
                  {isEditMode && (
                    <span className="ms-1 text-sm font-normal text-amber-600 dark:text-amber-400">
                      {t('inventory.editExistingItemsOrAddNewOnes')}
                    </span>
                  )}
                </SectionHeading>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {plural('lineCount', tally.lines)}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {bulkProducts.length === 0 ? (
                  <div className="px-6 py-14 text-center">
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
                    <table
                      key={`table-instance-${modalInstanceRef.current}-${bulkProducts.length}`}
                      className={`w-full ${showCostColumn ? 'min-w-[1480px]' : 'min-w-[1220px]'}`}
                    >
                      <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className={`w-10 text-slate-400 dark:text-slate-500 ${headCellClass}`}>
                            <span className="sr-only">{t('inventory.receivePage.line')}</span>#
                          </th>
                          <th className={`w-[260px] ${headCellClass}`}>{t('inventory.product')}</th>
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.qty')}</th>
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.unit')}</th>
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.weight')}</th>
                          {showCostColumn && (
                            <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.price')}</th>
                          )}
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.sellingPrice')}</th>
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.sellingPriceCurrency')}</th>
                          <th className={`${colFieldClass} ${headCellClass}`}>{t('inventory.skuBarcode')}</th>
                          {showCostColumn && (
                            <th className={`w-28 text-end ${headCellClass}`}>{t('inventory.receivePage.lineValue')}</th>
                          )}
                          <th className="w-12 px-2 py-2.5">
                            <span className="sr-only">{t('inventory.actions')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody
                        key={`tbody-instance-${modalInstanceRef.current}`}
                        className="divide-y divide-slate-100 dark:divide-slate-800"
                      >
                        {bulkProducts.map((productId, index) => {
                          const item = bulkItems[productId] || { product_id: '', quantity: '', unit: defaultUnitCode, price: '', selling_price: '', weight: '', sku: '' };
                          const lineCur = normalizeToAccepted(
                            item.price_currency || item.selling_price_currency,
                            acList,
                            feeCurrency
                          );
                          const lineSym = CURRENCY_META[lineCur]?.symbol ?? lineCur;
                          const product = products.find((p: any) => p.id === item.product_id);
                          const productName = product?.name || '';
                          const isEditingExisting = isEditMode && productId.startsWith('edit_');
                          const weightTracked = item.weight_tracked ?? isMassUnitCode(item.unit);
                          const lineValue = tally.lineValues.get(productId);
                          const lineLabel = `${t('inventory.receivePage.line')} ${index + 1}`;

                          return (
                            <tr
                              key={productId}
                              className={`align-top transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                                isEditingExisting ? 'bg-amber-50/60 dark:bg-amber-500/[0.06]' : ''
                              }`}
                            >
                              <td className="px-2 py-3 text-sm tabular-nums text-slate-400 dark:text-slate-500">
                                {index + 1}
                              </td>

                              <td className="px-2 py-3 w-[260px]">
                                <div>
                                  <SearchableSelect
                                    options={products.map((p: any) => ({
                                      id: p.id,
                                      label: getProductName(p),
                                      value: p.id,
                                      category: categoryLookup.label(p),
                                    }))}
                                    value={item.product_id || ''}
                                    onChange={(value: any) => {
                                      const selectedId = value as string;
                                      setBulkItems(prev => ({
                                        ...prev,
                                        [productId]: { ...prev[productId], product_id: selectedId, unit: prev[productId]?.unit || defaultUnitCode }
                                      }));
                                    }}
                                    placeholder={t('inventory.selectProduct')}
                                    searchPlaceholder={t('inventory.searchProducts')}
                                    categories={activeCategoryLabels}
                                    showAddOption={true}
                                    addOptionText={t('inventory.addNewProduct')}
                                    onAddNew={() => setAddProductForRow(productId)}
                                    className="w-full"
                                    /* The body scrolls in both axes now — an inline
                                       dropdown would be clipped by it. */
                                    portal={true}
                                  />
                                </div>
                                {isEditingExisting && (
                                  <span className="mt-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                    {t('inventory.receivePage.existingLine')}
                                  </span>
                                )}
                                {errors[`product_${productId}`] && (
                                  <p className="mt-1 text-xs text-red-600">{errors[`product_${productId}`]}</p>
                                )}
                              </td>

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...prev[productId], quantity: e.target.value }
                                  }))}
                                  className={`${cellFieldClass} ${errors[`quantity_${productId}`] ? errorFieldClass : ''}`}
                                  min="1"
                                  step="0.01"
                                  placeholder="0"
                                  aria-label={`${t('inventory.qty')} — ${lineLabel}`}
                                />
                                {errors[`quantity_${productId}`] && (
                                  <p className="mt-1 text-xs text-red-600">{errors[`quantity_${productId}`]}</p>
                                )}
                              </td>

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <select
                                  value={item.unit}
                                  onChange={(e) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...prev[productId], unit: e.target.value }
                                  }))}
                                  className={fieldClass}
                                  aria-label={`${t('inventory.unit')} — ${lineLabel}`}
                                >
                                  {activeUnits.length === 0 && (
                                    <option value="" disabled>{t('app.loading')}</option>
                                  )}
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

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={productName.toLowerCase() === 'plastic'}
                                  value={item.weight || ''}
                                  onChange={(e) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...prev[productId], weight: e.target.value }
                                  }))}
                                  className={`${cellFieldClass} disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/60 ${errors[`weight_${productId}`] ? errorFieldClass : ''}`}
                                  placeholder={t('inventory.kg')}
                                  aria-label={`${t('inventory.weight')} — ${lineLabel}`}
                                />
                                {!isEditingExisting && (
                                  <label className="mt-1.5 flex cursor-pointer items-center gap-1.5" title={t('losses.weightTrackedHint')}>
                                    <input
                                      type="checkbox"
                                      checked={weightTracked}
                                      onChange={(e) => setBulkItems(prev => ({
                                        ...prev,
                                        [productId]: { ...prev[productId], weight_tracked: e.target.checked }
                                      }))}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                                    />
                                    <span className="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                                      {t('losses.weightTracked')}
                                    </span>
                                  </label>
                                )}
                                {errors[`weight_${productId}`] && (
                                  <p className="mt-1 text-xs text-red-600">{errors[`weight_${productId}`]}</p>
                                )}
                              </td>

                              {showCostColumn && (
                                <td className={`px-2 py-3 ${colFieldClass}`}>
                                  <MoneyInput
                                    value={item.price || ''}
                                    onChange={(value) => setBulkItems(prev => ({
                                      ...prev,
                                      [productId]: { ...prev[productId], price: value }
                                    }))}
                                    prefix={lineSym}
                                    placeholder="0"
                                    ariaLabel={`${t('inventory.price')} — ${lineLabel}`}
                                    className={`${moneyFieldClass} ${errors[`price_${productId}`] ? errorFieldClass : ''}`}
                                  />
                                  {errors[`price_${productId}`] && (
                                    <p className="mt-1 text-xs text-red-600">{errors[`price_${productId}`]}</p>
                                  )}
                                </td>
                              )}

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <MoneyInput
                                  value={item.selling_price || ''}
                                  onChange={(value) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...prev[productId], selling_price: value }
                                  }))}
                                  prefix={lineSym}
                                  placeholder="0"
                                  ariaLabel={`${t('inventory.sellingPrice')} — ${lineLabel}`}
                                  className={`${moneyFieldClass} ${errors[`selling_price_${productId}`] ? errorFieldClass : ''}`}
                                />
                                {errors[`selling_price_${productId}`] && (
                                  <p className="mt-1 text-xs text-red-600">{errors[`selling_price_${productId}`]}</p>
                                )}
                              </td>

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <AcceptedCurrencySelect
                                  acceptedCurrencies={acList}
                                  value={lineCur}
                                  onChange={(currency) =>
                                    setBulkItems((prev) => ({
                                      ...prev,
                                      [productId]: {
                                        ...prev[productId],
                                        price_currency: currency,
                                        selling_price_currency: currency,
                                      },
                                    }))
                                  }
                                  className="h-11 w-full"
                                  aria-label={t('inventory.lineItemCurrency')}
                                />
                              </td>

                              <td className={`px-2 py-3 ${colFieldClass}`}>
                                <input
                                  type="text"
                                  value={item.sku || ''}
                                  onChange={(e) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...prev[productId], sku: e.target.value }
                                  }))}
                                  className={`${fieldClass} ${errors[`sku_${productId}`] ? errorFieldClass : ''}`}
                                  placeholder={t('inventory.skuBarcode')}
                                  aria-label={`${t('inventory.skuBarcode')} — ${lineLabel}`}
                                />
                                {errors[`sku_${productId}`] && (
                                  <p className="mt-1 text-xs text-red-600">{errors[`sku_${productId}`]}</p>
                                )}
                              </td>

                              {showCostColumn && (
                                <td className="px-2 py-3 text-end">
                                  {lineValue ? (
                                    <>
                                      <span className="text-sm font-medium tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                                        {formatMoney(lineValue.value, lineValue.currency)}
                                      </span>
                                      {/* Worth saying only when both are filled — the
                                          service prices by weight and ignores the count. */}
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

                              <td className="px-2 py-3">
                                {isEditingExisting ? (
                                  <span
                                    className="inline-flex rounded p-1.5 text-slate-300 dark:text-slate-600"
                                    title={t('inventory.cannotRemoveExistingItem')}
                                  >
                                    <Lock className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only">{t('inventory.cannotRemoveExistingItem')}</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeProductRow(productId)}
                                    className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:bg-red-950/40"
                                    title={t('inventory.removeProduct')}
                                    aria-label={`${t('inventory.removeProduct')} — ${lineLabel}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* One way in, at the end of the list — not a button per row */}
                <button
                  type="button"
                  onClick={addProductRow}
                  className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-300 py-3.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                >
                  <Plus className="h-4 w-4" />
                  {t('inventory.receivePage.addLine')}
                </button>
              </div>

              {errors.product_id && <p className="mt-2 text-xs text-red-600">{errors.product_id}</p>}
            </div>
          </div>

          {/* Commit bar — the tally travels with the buttons, so a long
              manifest can be checked and committed without scrolling. */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <Stat label={t('inventory.receivePage.statLines')} value={formatNumber(tally.lines)} />
                <Stat label={t('inventory.receivePage.statUnits')} value={formatNumber(tally.units)} />
                <Stat
                  label={t('inventory.kg')}
                  value={formatNumber(tally.weight, tally.weight % 1 === 0 ? 0 : 1)}
                />
                {totalsList.map(([currency, amount]) => (
                  <Stat
                    key={currency}
                    label={totalsList.length > 1
                      ? `${t('inventory.receivePage.total')} ${currency}`
                      : t('inventory.receivePage.total')}
                    value={formatMoney(amount, currency)}
                    strong
                  />
                ))}
              </dl>

              <div className="flex items-center gap-3">
                {isEditMode && !changesPending && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {t('inventory.receivePage.noChanges')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t('inventory.cancel')}
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900"
                  disabled={loading || tally.lines === 0 || (isEditMode && !changesPending)}
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {isEditMode
                        ? t('inventory.receivePage.updating')
                        : t('inventory.receivePage.receiving')}
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4" />
                      {isEditMode
                        ? t('inventory.updateBatch')
                        : tally.lines === 1
                          ? t('inventory.receivePage.receiveLine')
                          : t('inventory.receivePage.receiveLines', { count: tally.lines })}
                    </>
                  )}
                </button>
              </div>
            </div>

            {tally.unpriced > 0 && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {plural('unpriced', tally.unpriced)}
              </p>
            )}
            {form.type === 'commission' && tally.lines > 0 && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {t('inventory.receivePage.commissionPricedOnSale')}
              </p>
            )}
          </div>
        </form>
      </div>

      {/* Supplier Form Modal */}
      {addSupplier && (
        <SupplierFormModal
          open={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSuccess={handleAddSupplier}
          existingSuppliers={suppliers}
        />
      )}

      {/* Add Product Modal — opened from a line's product picker */}
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
    </div>
  );
};

export default ReceiveFormModal;

