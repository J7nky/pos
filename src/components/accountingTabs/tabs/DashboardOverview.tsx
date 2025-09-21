import React from "react";
import {
  RefreshCw,
  Wallet,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Users,
  ArrowDownRight,
} from "lucide-react";

type Currency = "USD" | "LBP";

type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  createdAt: string;
};

type Customer = {
  lb_balance?: number;
  usd_balance?: number;
};

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  borderColor: string;
  children?: React.ReactNode;
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  borderColor,
  children,
}) => (
  <div
    className={`bg-white rounded-xl shadow-sm p-6 border-l-4 ${borderColor}`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {children}
      </div>
      <div className="p-3 bg-gray-100 rounded-full">{icon}</div>
    </div>
  </div>
);

type RecentActivityProps = {
  transactions: Transaction[];
  formatCurrencyWithSymbol: (amount: number, currency: Currency) => string;
};

const RecentActivity: React.FC<RecentActivityProps> = ({
  transactions,
  formatCurrencyWithSymbol,
}) => {
  const recentTransactions = transactions
    .filter(
      (t) =>
        new Date(t.createdAt) >=
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          View All
        </button>
      </div>

      <div className="space-y-4">
        {recentTransactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center">
              <div
                className={`p-2 rounded-full mr-3 ${
                  transaction.type === "income" ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {transaction.type === "income" ? (
                  <ArrowDownRight className="w-4 h-4 text-green-600" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-red-600" />
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {transaction.category}
                </div>
                <div className="text-xs text-gray-500">
                  {transaction.description}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-sm font-semibold ${
                  transaction.type === "income"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}
                {formatCurrencyWithSymbol(
                  transaction.amount,
                  transaction.currency || "USD"
                )}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(transaction.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type DashboardOverviewProps = {
  cashDrawerBalance: number | null;
  refreshCashDrawerBalance: () => Promise<void>;
  formatCurrency: (value: number) => string;
  formatCurrencyWithSymbol: (value: number, currency: Currency) => string;
  dashboardPeriod: string;
  getPeriodData: {
    income: number;
    expenses: number;
    incomeChange: number;
    expenseChange: number;
  };
  customers: Customer[];
  transactions: Transaction[];
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cashDrawerBalance,
  refreshCashDrawerBalance,
  formatCurrency,
  formatCurrencyWithSymbol,
  dashboardPeriod,
  getPeriodData,
  customers,
  transactions,
}) => {
  const totalLBPDebt = customers
    .filter((c) => (c.lb_balance || 0) > 0)
    .reduce((sum, c) => sum + (c.lb_balance || 0), 0);

  const totalUSDDebt = customers
    .filter((c) => (c.usd_balance || 0) > 0)
    .reduce((sum, c) => sum + (c.usd_balance || 0), 0);

  const customersWithDebt = customers.filter(
    (c) => (c.lb_balance || 0) > 0 || (c.usd_balance || 0) > 0
  ).length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Cash Drawer */}
        <StatCard
          title="Cash Drawer Balance"
          value={
            cashDrawerBalance === null
              ? "—"
              : formatCurrency(cashDrawerBalance)
          }
          borderColor="border-emerald-500"
          icon={<Wallet className="w-6 h-6 text-emerald-600" />}
        >
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <button
              onClick={async () => {
                await refreshCashDrawerBalance();
              }}
              className="inline-flex items-center px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </button>
          </div>
        </StatCard>

        {/* Revenue */}
        <StatCard
          title={`Revenue (${dashboardPeriod})`}
          value={formatCurrency(getPeriodData.income)}
          borderColor="border-blue-500"
          icon={<TrendingUp className="w-6 h-6 text-blue-600" />}
        >
          <div className="flex items-center mt-2">
            {getPeriodData.incomeChange >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
            )}
            <span
              className={`text-sm font-medium ${
                getPeriodData.incomeChange >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {Math.abs(getPeriodData.incomeChange).toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500 ml-1">vs prev period</span>
          </div>
        </StatCard>

        {/* Expenses */}
        <StatCard
          title={`Expenses (${dashboardPeriod})`}
          value={formatCurrency(getPeriodData.expenses)}
          borderColor="border-red-500"
          icon={<TrendingDown className="w-6 h-6 text-red-600" />}
        >
          <div className="flex items-center mt-2">
            {getPeriodData.expenseChange >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-red-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
            )}
            <span
              className={`text-sm font-medium ${
                getPeriodData.expenseChange >= 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {Math.abs(getPeriodData.expenseChange).toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500 ml-1">vs prev period</span>
          </div>
        </StatCard>

        {/* Customer Debt */}
        <StatCard
          title="Total Customer Debt"
          value={
            <>
              LBP: {formatCurrency(totalLBPDebt)}
              <br />
              USD: {formatCurrency(totalUSDDebt)}
            </>
          }
          borderColor="border-green-500"
          icon={<Wallet className="w-6 h-6 text-green-600" />}
        >
          <div className="flex items-center mt-2">
            <Users className="w-4 h-4 text-blue-500 mr-1" />
            <span className="text-sm font-medium text-blue-600">
              {customersWithDebt}
            </span>
            <span className="text-xs text-gray-500 ml-1">
              customers with debt
            </span>
          </div>
        </StatCard>
      </div>

      {/* Recent Activity */}
      <div className="mt-6">
        <RecentActivity
          transactions={transactions}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol}
        />
      </div>
    </div>
  );
};
export default DashboardOverview;