import React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Filter,
  RefreshCw,
  Download,
  BarChart3,
  AlertCircle,
  Package,
  FileText,
  Wallet,
  FileText as Document,
} from "lucide-react";

type ActionTabsBarProps = {
  dashboardPeriod: string;
  setDashboardPeriod: (period: string) => void;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: (val: boolean) => void;
  setShowForm: (form: "receive" | "pay" | "expense") => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  filteredNonPricedItems: any[];
};

const ActionTabsBar: React.FC<ActionTabsBarProps> = ({
  dashboardPeriod,
  setDashboardPeriod,
  showAdvancedFilters,
  setShowAdvancedFilters,
  setShowForm,
  activeTab,
  setActiveTab,
  filteredNonPricedItems,
}) => {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "expenses", label: "Expenses", icon: Receipt },
    { id: "nonpriced", label: "Non Priced Items", icon: AlertCircle },
    { id: "bills-management", label: "Bills Management", icon: Document },
    { id: "received-bills", label: "Received Bills", icon: FileText },
    { id: "cash-drawer", label: "Cash Drawer", icon: Wallet },
    
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-lg shadow-sm border">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowForm("receive")}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center shadow-sm"
          >
            <ArrowDownRight className="w-4 h-4 mr-2" />
            Receive
          </button>
          <button
            onClick={() => setShowForm("pay")}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center shadow-sm"
          >
            <ArrowUpRight className="w-4 h-4 mr-2" />
            Pay
          </button>
          <button
            onClick={() => setShowForm("expense")}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center shadow-sm"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Expense
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={dashboardPeriod}
            onChange={(e) => setDashboardPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showAdvancedFilters
                ? "bg-blue-100 text-blue-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

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
            {tab.label}
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
