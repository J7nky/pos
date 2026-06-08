import React from "react";
import {
  Receipt,
  BarChart3,
  AlertCircle,
  FileText,
  Wallet,
  FileText as Document,
  DollarSign,
} from "lucide-react";
import { useI18n } from "../../../i18n";
type AccountingTab =
  | "dashboard"
  | "nonpriced"
  | "bills-management"
  | "received-bills"
  | "cash-drawer"
  | "payments";

type ActionTabsBarProps = {
  activeTab: AccountingTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AccountingTab>>;
  filteredNonPricedItems: any[];
};

const ActionTabsBar: React.FC<ActionTabsBarProps> = ({
  activeTab,
  setActiveTab,
  filteredNonPricedItems,
}) => {
  const { t } = useI18n();
  const tabs: { id: AccountingTab; labelKey: string; icon: React.ElementType }[] = [
    // Dashboard tab archived — kept for restore; remove the comment to re-enable.
    // { id: "dashboard", labelKey: "accounting.tabs.dashboard", icon: BarChart3 },
    { id: "bills-management", labelKey: "accounting.tabs.billsManagement", icon: Document },
    { id: "nonpriced", labelKey: "accounting.tabs.nonpriced", icon: AlertCircle },
    { id: "received-bills", labelKey: "accounting.tabs.receivedBills", icon: FileText },
    { id: "payments", labelKey: "accounting.tabs.payments", icon: DollarSign },
    { id: "cash-drawer", labelKey: "accounting.tabs.cashDrawer", icon: Wallet },
  ];

  return (
    <div className="mb-6">
      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md transition-colors flex items-center relative whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {t(tab.labelKey)}
            {tab.id === "nonpriced" && filteredNonPricedItems.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center">
                {filteredNonPricedItems.length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ActionTabsBar;
