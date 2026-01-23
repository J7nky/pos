import React from "react";
import { TrendingDown, CheckCircle } from "lucide-react";
import SearchableSelect from "../../common/SearchableSelect";

type EntityType = "customer" | "supplier";
type Currency = "USD" | "LBP";

interface PaymentFormState {
    entityType: EntityType;
    entityId: string;
    amount: string;
    currency: Currency;
    description: string;
}

interface EntityPaymentFormProps {
    mode: "pay" | "receive";
    form: PaymentFormState;
    setForm: React.Dispatch<React.SetStateAction<PaymentFormState>>;
    entities: Array<{
        id: string;
        name: string;
        entity_type: string;
        is_active?: boolean;
        _deleted?: boolean;
    }>;
    recentEntities: string[];
    setRecentEntities: (entities: string[]) => void;
    setShowAddCustomerForm: (show: boolean) => void;
    setShowAddSupplierForm: (show: boolean) => void;
    handleSubmit: (e: React.FormEvent) => void;
    showToast: (msg: string, type: "error" | "success") => void;
    currency: string;
    formatCurrencyWithSymbol: (amount: number, currency: string) => string;
    formatCurrency: (amount: number) => string;
    getConvertedAmount: (amount: number, currency: string) => number;
    onCancel: () => void;
}

// Mode-specific configuration
const modeConfig = {
    pay: {
        banner: {
            bg: "bg-red-50",
            border: "border-red-200",
            textColor: "text-red-800",
            iconColor: "text-red-600",
        },
        message: "Record a payment sent to a customer or supplier",
        Icon: TrendingDown,
        focusRing: "focus:ring-red-500 focus:border-red-500",
        radioColor: "text-red-600",
        button: {
            bg: "bg-red-600",
            hover: "hover:bg-red-700",
        },
    },
    receive: {
        banner: {
            bg: "bg-green-50",
            border: "border-green-200",
            textColor: "text-green-800",
            iconColor: "text-green-600",
        },
        message: "Record a payment received from a customer or supplier",
        Icon: CheckCircle,
        focusRing: "focus:ring-green-500 focus:border-green-500",
        radioColor: "text-green-600",
        button: {
            bg: "bg-green-600",
            hover: "hover:bg-green-700",
        },
    },
};

export const EntityPaymentForm: React.FC<EntityPaymentFormProps> = ({
    mode,
    form,
    setForm,
    entities,
    recentEntities,
    setRecentEntities,
    setShowAddCustomerForm,
    setShowAddSupplierForm,
    handleSubmit,
    currency,
    formatCurrencyWithSymbol,
    formatCurrency,
    getConvertedAmount,
    onCancel,
}) => {
    const config = modeConfig[mode];
    const { Icon, banner, focusRing, radioColor, button, message } = config;

    // Filter entities by type for the current selection
    const filteredEntities = entities.filter((entity) => {
        if (form.entityType === "customer") {
            return entity.entity_type === "customer" && entity.is_active !== false;
        } else if (form.entityType === "supplier") {
            return entity.entity_type === "supplier" && !entity._deleted;
        }
        return false;
    });

    // Filter recent entities by type
    const filteredRecentEntities = recentEntities.filter((id: string) => {
        const entity = entities.find((e) => e.id === id);
        if (!entity) return false;
        if (form.entityType === "customer") {
            return entity.entity_type === "customer";
        } else if (form.entityType === "supplier") {
            return entity.entity_type === "supplier";
        }
        return false;
    });

    const handleEntityChange = (value: string | string[]) => {
        const entityId = Array.isArray(value) ? value[0] : value;
        setForm((prev) => ({ ...prev, entityId: entityId || "" }));
        // Update recent entities
        if (entityId && !filteredRecentEntities.includes(entityId)) {
            const updated = [entityId, ...filteredRecentEntities].slice(0, 10);
            // Merge with existing recent entities, keeping only the ones for current type
            const otherRecentEntities = recentEntities.filter((id: string) => {
                const entity = entities.find((e) => e.id === id);
                if (!entity) return false;
                return entity.entity_type !== form.entityType;
            });
            setRecentEntities([...updated, ...otherRecentEntities]);
        }
    };

    const handleRecentUpdate = (updated: string[]) => {
        // Merge with entities of other types
        const otherRecentEntities = recentEntities.filter((id: string) => {
            const entity = entities.find((e) => e.id === id);
            if (!entity) return false;
            return entity.entity_type !== form.entityType;
        });
        setRecentEntities([...updated, ...otherRecentEntities]);
    };

    const handleEntityTypeChange = (newType: EntityType) => {
        setForm((prev) => ({
            ...prev,
            entityType: newType,
            entityId: "", // Reset entity selection when type changes
        }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Banner */}
            <div className={`${banner.bg} border ${banner.border} rounded-lg p-4 mb-6`}>
                <div className="flex items-center">
                    <Icon className={`w-5 h-5 ${banner.iconColor} mr-2`} />
                    <span className={`${banner.textColor} font-medium`}>{message}</span>
                </div>
            </div>

            <div className="grid-cols-1 md:grid-cols-2 gap-6">
                {/* Entity Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Entity Type *
                    </label>
                    <div className="space-y-2 p-2">
                        <label className="flex items-center space-x-1 cursor-pointer">
                            <input
                                type="radio"
                                name={`${mode}EntityType`}
                                value="customer"
                                checked={form.entityType === "customer"}
                                onChange={() => handleEntityTypeChange("customer")}
                                className={`w-4 h-4 ${radioColor} border-gray-300 focus:ring-${mode === "pay" ? "red" : "green"}-500`}
                            />
                            <span className="text-sm text-gray-700">Customer</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="radio"
                                name={`${mode}EntityType`}
                                value="supplier"
                                checked={form.entityType === "supplier"}
                                onChange={() => handleEntityTypeChange("supplier")}
                                className={`w-4 h-4 ${radioColor} border-gray-300 focus:ring-${mode === "pay" ? "red" : "green"}-500`}
                            />
                            <span className="text-sm text-gray-700">Supplier</span>
                        </label>
                    </div>
                </div>

                {/* Entity Selector */}
                <div>
                    <SearchableSelect
                        options={filteredEntities.map((entity) => ({
                            id: entity.id,
                            label: entity.name,
                            value: entity.id,
                            category: form.entityType === "customer" ? "Customer" : "Supplier",
                        }))}
                        value={form.entityId}
                        onChange={handleEntityChange}
                        placeholder={`Select ${form.entityType === "customer" ? "Customer" : "Supplier"} *`}
                        searchPlaceholder={`Search ${form.entityType === "customer" ? "customers" : "suppliers"}...`}
                        recentSelections={filteredRecentEntities}
                        onRecentUpdate={handleRecentUpdate}
                        showAddOption={true}
                        addOptionText={`Add New ${form.entityType === "customer" ? "Customer" : "Supplier"}`}
                        onAddNew={() =>
                            form.entityType === "customer"
                                ? setShowAddCustomerForm(true)
                                : setShowAddSupplierForm(true)
                        }
                        className="w-full"
                    />
                </div>

                {/* Amount */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount *
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${focusRing}`}
                        required
                        placeholder="0.00"
                    />
                </div>

                {/* Currency */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Currency *
                    </label>
                    <select
                        value={form.currency}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                currency: e.target.value as Currency,
                            }))
                        }
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${focusRing}`}
                    >
                        <option value="USD">USD ($)</option>
                        <option value="LBP">LBP (ل.ل)</option>
                    </select>
                </div>
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                </label>
                <input
                    type="text"
                    value={form.description}
                    onChange={(e) =>
                        setForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 ${focusRing}`}
                    placeholder={
                        mode === "pay"
                            ? "e.g., Payment for goods, Commission payment, etc."
                            : "e.g., Payment for invoice #123, Cash payment, etc."
                    }
                />
            </div>

            {/* Conversion */}
            {form.currency !== currency && form.amount && (
                <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                        <span className="font-medium">Conversion:</span>
                        <span className="font-semibold">
                            {formatCurrencyWithSymbol(parseFloat(form.amount), form.currency)} ={" "}
                            {formatCurrency(
                                getConvertedAmount(parseFloat(form.amount), form.currency)
                            )}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                </div>
            )}

            {/* Footer */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className={`px-6 py-2 ${button.bg} text-white rounded-lg ${button.hover} transition-colors font-medium`}
                >
                    Record Payment
                </button>
            </div>
        </form>
    );
};

// Backward-compatible wrapper props interfaces
interface LegacyPayFormProps {
    payForm: any;
    setPayForm: React.Dispatch<React.SetStateAction<any>>;
    handlePaySubmit: (e: React.FormEvent) => void;
    entities: any[];
    recentEntities: string[];
    setRecentEntities: (entities: string[]) => void;
    setShowAddCustomerForm: (show: boolean) => void;
    setShowAddSupplierForm: (show: boolean) => void;
    showToast: (msg: string, type: "error" | "success") => void;
    currency: string;
    formatCurrencyWithSymbol: (amount: number, currency: string) => string;
    formatCurrency: (amount: number) => string;
    getConvertedAmount: (amount: number, currency: string) => number;
    onCancel: () => void;
}

interface LegacyReceiveFormProps {
    receiveForm: any;
    setReceiveForm: React.Dispatch<React.SetStateAction<any>>;
    handleReceiveSubmit: (e: React.FormEvent) => void;
    entities: any[];
    recentEntities: string[];
    setRecentEntities: (entities: string[]) => void;
    setShowAddCustomerForm: (show: boolean) => void;
    setShowAddSupplierForm: (show: boolean) => void;
    showToast: (msg: string, type: "error" | "success") => void;
    currency: string;
    formatCurrencyWithSymbol: (amount: number, currency: string) => string;
    formatCurrency: (amount: number) => string;
    getConvertedAmount: (amount: number, currency: string) => number;
    onCancel: () => void;
}

// Re-export with backwards-compatible names for gradual migration
export const PayForm: React.FC<LegacyPayFormProps> = ({
    payForm,
    setPayForm,
    handlePaySubmit,
    entities,
    recentEntities,
    setRecentEntities,
    setShowAddCustomerForm,
    setShowAddSupplierForm,
    showToast,
    currency,
    formatCurrencyWithSymbol,
    formatCurrency,
    getConvertedAmount,
    onCancel,
}) => {
    return (
        <EntityPaymentForm
            mode="pay"
            form={payForm}
            setForm={setPayForm}
            handleSubmit={handlePaySubmit}
            entities={entities}
            recentEntities={recentEntities}
            setRecentEntities={setRecentEntities}
            setShowAddCustomerForm={setShowAddCustomerForm}
            setShowAddSupplierForm={setShowAddSupplierForm}
            showToast={showToast}
            currency={currency}
            formatCurrencyWithSymbol={formatCurrencyWithSymbol}
            formatCurrency={formatCurrency}
            getConvertedAmount={getConvertedAmount}
            onCancel={onCancel}
        />
    );
};

export const ReceiveForm: React.FC<LegacyReceiveFormProps> = ({
    receiveForm,
    setReceiveForm,
    handleReceiveSubmit,
    entities,
    recentEntities,
    setRecentEntities,
    setShowAddCustomerForm,
    setShowAddSupplierForm,
    showToast,
    currency,
    formatCurrencyWithSymbol,
    formatCurrency,
    getConvertedAmount,
    onCancel,
}) => {
    return (
        <EntityPaymentForm
            mode="receive"
            form={receiveForm}
            setForm={setReceiveForm}
            handleSubmit={handleReceiveSubmit}
            entities={entities}
            recentEntities={recentEntities}
            setRecentEntities={setRecentEntities}
            setShowAddCustomerForm={setShowAddCustomerForm}
            setShowAddSupplierForm={setShowAddSupplierForm}
            showToast={showToast}
            currency={currency}
            formatCurrencyWithSymbol={formatCurrencyWithSymbol}
            formatCurrency={formatCurrency}
            getConvertedAmount={getConvertedAmount}
            onCancel={onCancel}
        />
    );
};

