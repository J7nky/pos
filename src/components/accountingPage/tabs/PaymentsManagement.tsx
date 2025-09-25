import React from "react";
import { Plus } from "lucide-react";
import { paymentService, PaymentTransaction } from "../../../services/paymentService";

type Currency = "USD" | "LBP";

type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  created_at: string;
  reference: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  store_id: string;
  created_by: string;
};

type ExpenseCategory = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
};

type ExpenseManagementProps = {
  expenseCategories: ExpenseCategory[];
  transactions: Transaction[];
  today: string; // formatted as YYYY-MM-DD
  currency: Currency;
  setShowForm: (formType: "expense" | null) => void;
  formatCurrency: (value: number) => string;
  formatCurrencyWithSymbol: (value: number, currency: Currency) => string;
  getConvertedAmount: (amount: number, targetCurrency: Currency) => number;
  customers?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string }>;
};

const ExpenseCategories: React.FC<
  Pick<
    ExpenseManagementProps,
    "expenseCategories" | "transactions" | "today" | "formatCurrency" | "getConvertedAmount"
  >
> = ({ expenseCategories, transactions, today, formatCurrency, getConvertedAmount }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {expenseCategories
          .filter((c) => c.is_active)
          .map((category) => {
            const todayCategoryExpenses = transactions.filter(
              (t) =>
                
                t.category === category.name &&
                t.created_at.split("T")[0] === today
            );

            const todayAmount = todayCategoryExpenses.reduce((sum, t) => {
              const convertedAmount = getConvertedAmount(t.amount, "USD"); // amounts stored in USD
              return sum + convertedAmount;
            }, 0);

            return (
              <div
                key={category.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <h4 className="font-medium text-gray-900">{category.name}</h4>
                <p className="text-sm text-gray-600 mb-2">
                  {category.description}
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(todayAmount)}
                </p>
                <p className="text-sm text-gray-500">
                  {todayCategoryExpenses.length} today
                </p>
              </div>
            );
          })}
      </div>
    </div>
  );
};

const ExpenseTable: React.FC<
  Pick<
    ExpenseManagementProps,
    "transactions" | "today" | "currency" | "formatCurrency" | "formatCurrencyWithSymbol" | "getConvertedAmount"
  >
> = ({ transactions, today, currency, formatCurrency, formatCurrencyWithSymbol, getConvertedAmount }) => {
  const todaysExpenses = transactions
    .filter((t) => t.type === "expense")
    .filter((t) => t.created_at.split("T")[0] === today)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Today's Expenses</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reference
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {todaysExpenses.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-gray-900">
                  {new Date(transaction.created_at).toLocaleTimeString()}
                </td>
                <td className="px-6 py-4 text-gray-900">
                  {transaction.category}
                </td>
                <td className="px-6 py-4 text-gray-900">
                  {transaction.description}
                </td>
                <td className="px-6 py-4 text-gray-900">
                  {formatCurrencyWithSymbol(
                    transaction.amount,
                    transaction.currency || "USD"
                  )}
                  {transaction.currency !== currency && (
                    <div className="text-xs text-gray-500">
                      ≈ {formatCurrency(getConvertedAmount(transaction.amount, "USD"))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {transaction.reference || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PaymentLogs: React.FC<
  Pick<
    ExpenseManagementProps,
    "transactions" | "today" | "currency" | "formatCurrency" | "formatCurrencyWithSymbol" | "getConvertedAmount" | "customers" | "suppliers"
  >
> = ({ transactions, today, currency, formatCurrency, formatCurrencyWithSymbol, getConvertedAmount, customers = [], suppliers = [] }) => {
  // Use the new payment service for robust filtering
  const todaysPayments = paymentService.getTodaysPayments(transactions, today);

  // Note: receivedPayments and paidPayments are calculated within paymentSummary

  // Helper function to get entity name
  const getEntityName = (transaction: PaymentTransaction) => {
    if (transaction.entityType === 'customer' && transaction.customer_id) {
      const customer = customers.find(c => c.id === transaction.customer_id);
      return customer?.name || 'Unknown Customer';
    }
    if (transaction.entityType === 'supplier' && transaction.supplier_id) {
      const supplier = suppliers.find(s => s.id === transaction.supplier_id);
      return supplier?.name || 'Unknown Supplier';
    }
    return 'Unknown Entity';
  };

  // Calculate totals using the enhanced payment service
  const paymentSummary = paymentService.calculatePaymentSummary(todaysPayments, currency);

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Today's Payment Logs</h3>
        <div className="mt-2 flex gap-6">
          <div className="text-sm">
            <span className="text-green-600 font-medium">Received: </span>
            <span className="font-semibold">{formatCurrency(paymentSummary.totalReceived)}</span>
            <span className="text-xs text-gray-500 ml-1">({paymentSummary.receivedCount} transactions)</span>
          </div>
          <div className="text-sm">
            <span className="text-red-600 font-medium">Paid: </span>
            <span className="font-semibold">{formatCurrency(paymentSummary.totalPaid)}</span>
            <span className="text-xs text-gray-500 ml-1">({paymentSummary.paidCount} transactions)</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600 font-medium">Net: </span>
            <span className={`font-semibold ${paymentSummary.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(paymentSummary.netAmount)}
            </span>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reference
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {todaysPayments.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-gray-900">
                  {new Date(transaction.created_at).toLocaleTimeString()}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    transaction.paymentDirection === 'received' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {transaction.paymentDirection === 'received' ? 'Received' : 'Paid'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-900">
                  <div className="flex flex-col">
                    <span className="font-medium">{getEntityName(transaction)}</span>
                    <span className="text-xs text-gray-500 capitalize">{transaction.entityType}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-900">
                  <div className="flex flex-col">
                    <span>{transaction.description}</span>
                    <span className="text-xs text-gray-500">{transaction.category}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-900">
                  <span className={transaction.paymentDirection === 'received' ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrencyWithSymbol(
                      transaction.amount,
                      transaction.currency || "USD"
                    )}
                  </span>
                  {transaction.currency !== currency && (
                    <div className="text-xs text-gray-500">
                      ≈ {formatCurrency(getConvertedAmount(transaction.amount, "USD"))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {transaction.reference || "-"}
                </td>
              </tr>
            ))}
            {todaysPayments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No payment transactions for today
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ExpenseManagement: React.FC<ExpenseManagementProps> = ({
  expenseCategories,
  transactions,
  today,
  currency,
  setShowForm,
  formatCurrency,
  formatCurrencyWithSymbol,
  getConvertedAmount,
  customers,
  suppliers,
}) => {
  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Expense Management
        </h2>
        <button
          onClick={() => setShowForm("expense")}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Expense
        </button>
      </div>

      {/* Payment Logs */}
      <PaymentLogs
        transactions={transactions}
        today={today}
        currency={currency}
        formatCurrency={formatCurrency}
        formatCurrencyWithSymbol={formatCurrencyWithSymbol}
        getConvertedAmount={getConvertedAmount}
        customers={customers}
        suppliers={suppliers}
      />

      <div className="mt-6">
        {/* Categories */}
        <ExpenseCategories
          expenseCategories={expenseCategories}
          transactions={transactions}
          today={today}
          formatCurrency={formatCurrency}
          getConvertedAmount={getConvertedAmount}
        />
      </div>

      <div className="mt-6">
        {/* Table */}
        <ExpenseTable
          transactions={transactions}
          today={today}
          currency={currency}
          formatCurrency={formatCurrency}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol}
          getConvertedAmount={getConvertedAmount}
        />
      </div>
    </div>
  );
};
export default ExpenseManagement;
