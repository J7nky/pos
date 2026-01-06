import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { EmployeeAttendanceService } from '../../../services/employeeAttendanceService';
import { EmployeeAttendance, Employee } from '../../../types';
import { DollarSign, User, LogIn, LogOut, Calendar, FileText } from 'lucide-react';
import { Pagination } from '../../../components/common/Pagination';
import { useI18n } from '../../../i18n';
import { rtlTableHeaderClasses, rtlTableCellClasses, rtlFlexClasses, rtlSpacingClasses } from '../../../utils/rtl';
import { useEntityBalances } from '../../../hooks/useEntityBalances';

interface EmployeePaymentsProps {
  employees: Employee[];
  showToast: (message: string, type: 'success' | 'error') => void;
  refreshData: () => Promise<void>;
  processEmployeePayment: (params: {
    employeeId: string;
    amount: string;
    currency: 'USD' | 'LBP';
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
  }) => Promise<{ success: boolean; error?: string }>;
  formatCurrency: (amount: number, currency: 'USD' | 'LBP') => string;
  formatCurrencyWithSymbol: (amount: number, currency: 'USD' | 'LBP') => string;
  onViewAccountStatement?: (employee: Employee) => void;
}

export default function EmployeePayments({
  employees,
  showToast,
  refreshData,
  processEmployeePayment,
  onViewAccountStatement
}: EmployeePaymentsProps) {
  const { userProfile } = useSupabaseAuth();
  const raw = useOfflineData();
  const [attendanceRecords, setAttendanceRecords] = useState<EmployeeAttendance[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';

  // Filter employees based on role
  const visibleEmployees = useMemo(() => {
    if (isAdmin) {
      return employees; // Admin can see all
    } else if (isManager) {
      return employees; // Manager can see all
    } else {
      // Cashier can only see themselves
      return employees.filter(e => e.id === userProfile?.id);
    }
  }, [employees, isAdmin, isManager, userProfile?.id]);

  // Get employee balances from journal entries (account 2200)
  const employeeIds = useMemo(() => visibleEmployees.map(e => e.id), [visibleEmployees]);
  const { balances: employeeBalances, refreshBalance } = useEntityBalances(
    employeeIds,
    'employee',
    true
  );

  // Load attendance records
  useEffect(() => {
    const loadAttendance = async () => {
      if (!raw.storeId) return;
      try {
        setLoading(true);
        const records = await EmployeeAttendanceService.getStoreAttendance(raw.storeId);
        setAttendanceRecords(records);
      } catch (error) {
        console.error('Failed to load attendance records:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAttendance();
  }, [raw.storeId]);

  // Get attendance history for an employee
  const getEmployeeAttendance = (employeeId: string) => {
    return attendanceRecords
      .filter(att => att.employee_id === employeeId)
      .sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());
  };

  // Calculate total hours worked today
  const getTodayHours = (employeeId: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRecords = attendanceRecords.filter(att => {
      const checkInDate = new Date(att.check_in_at);
      return checkInDate >= today && att.employee_id === employeeId;
    });
    return todayRecords.reduce((total, att) => {
      const hours = EmployeeAttendanceService.calculateHoursWorked(att);
      return total + (hours || 0);
    }, 0);
  };

  // Format balance display for employees
  // For employees: Positive balance = we owe them (unpaid salary), Negative = overpaid
  const formatBalanceDisplay = (balance: number, currency: 'USD' | 'LBP') => {
    if (balance > 0) {
      // We owe them (unpaid salary)
      const amountText = currency === 'USD' 
        ? `$${balance.toFixed(2)}` 
        : `${Math.round(balance).toLocaleString()} ل.ل`;
      return {
        text: `+${amountText}`,
        label: t('customers.weOwe') || 'We Owe',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: '💰',
        type: 'owed' as const
      };
    } else if (balance < 0) {
      // They overpaid (we paid more than owed)
      const amountText = currency === 'USD' 
        ? `$${Math.abs(balance).toFixed(2)}` 
        : `${Math.round(Math.abs(balance)).toLocaleString()} ل.ل`;
      return {
        text: `-${amountText}`,
        label: t('customers.overpaid') || 'Overpaid',
        color: 'text-green-700',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: '✅',
        type: 'overpaid' as const
      };
    } else {
      // Paid up
      const amountText = currency === 'USD' ? '$0.00' : '0 ل.ل';
      return {
        text: amountText,
        label: t('customers.paid') || 'Paid',
        color: 'text-gray-700',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: '✓',
        type: 'paid' as const
      };
    }
  };

  // Handle payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !userProfile?.store_id || !userProfile?.id) {
      showToast(t('customers.pleaseSelectAnEmployee'), 'error');
      return;
    }

    const numAmount = parseFloat(paymentForm.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast(t('customers.pleaseEnterAValidAmount'), 'error');
      return;
    }

    const result = await processEmployeePayment({
      employeeId: selectedEmployee,
      amount: paymentForm.amount,
      currency: paymentForm.currency,
      description: paymentForm.description || t('customers.employeePayment'),
      reference: `EMP-${Date.now()}`,
      storeId: userProfile.store_id,
      createdBy: userProfile.id
    });

    if (result.success) {
      showToast(t('customers.paymentProcessedSuccessfully'), 'success');
      // Refresh balances for the employee who received payment before clearing selection
      if (selectedEmployee) {
        await refreshBalance(selectedEmployee);
      }
      // Also refresh all data
      await refreshData();
      // Clear form and selection after refresh
      setShowPaymentForm(false);
      setPaymentForm({ amount: '', currency: 'USD', description: '' });
      setSelectedEmployee(null);
    } else {
      showToast(result.error || t('customers.failedToProcessPayment'), 'error');
    }
  };

  // Pagination
  const paginatedEmployees = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return visibleEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [visibleEmployees, page]);

  const totalPages = Math.ceil(visibleEmployees.length / itemsPerPage);

  // Check if user can pay an employee
  const canPayEmployee = (employeeId: string): boolean => {
    if (isAdmin) return true;
    if (isManager) return true; // Manager can pay employees
    return employeeId === userProfile?.id; // Cashier can only pay themselves
  };
const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('customers.employeePaymentsAndAttendance')}</h2>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">{t('customers.loading')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 ">
              <thead className="bg-gray-50">
                <tr>
                  <th className={rtlTableHeaderClasses}>{t('customers.employee')}</th>
                  <th className={rtlTableHeaderClasses}>{t('customers.balance')}</th>
                  <th className={rtlTableHeaderClasses}>{t('customers.status')}</th>
                  <th className={rtlTableHeaderClasses}>{t('customers.todayHours')}</th>
                  <th className={rtlTableHeaderClasses}>{t('customers.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedEmployees.map((employee) => {
                  const currentStatus = attendanceRecords.find(
                    att => att.employee_id === employee.id && att.check_out_at === null
                  );
                  const todayHours = getTodayHours(employee.id);
                  
                  // Get calculated balance from journal entries (account 2200)
                  const balanceData = employeeBalances.get(employee.id);
                  const usdBalance = balanceData?.USD || 0;
                  const lbpBalance = balanceData?.LBP || 0;

                  return (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className={`${rtlTableCellClasses} whitespace-nowrap`}>
                        <div className={rtlFlexClasses}>
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className={rtlSpacingClasses.marginLeft}>
                            <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                            <div className="text-sm text-gray-500">{employee.email}</div>
                            <div className="text-xs text-gray-400">{employee.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${rtlTableCellClasses} whitespace-nowrap`}>
                        {balanceData?.isLoading ? (
                          <div className="text-sm text-gray-400">Loading...</div>
                        ) : (
                          <div className="space-y-1">
                            {(() => {
                              const lbpBalanceDisplay = formatBalanceDisplay(lbpBalance, 'LBP');
                              return (
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${lbpBalanceDisplay.bgColor} ${lbpBalanceDisplay.borderColor}`}>
                                  <span className="text-base">{lbpBalanceDisplay.icon}</span>
                                  <span className={`text-xs font-semibold ${lbpBalanceDisplay.color}`}>
                                    {lbpBalanceDisplay.label}:
                                  </span>
                                  <span className={`text-sm font-bold ${lbpBalanceDisplay.color}`}>
                                    {lbpBalanceDisplay.text}
                                  </span>
                                </div>
                              );
                            })()}
                            {(() => {
                              const usdBalanceDisplay = formatBalanceDisplay(usdBalance, 'USD');
                              return (
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${usdBalanceDisplay.bgColor} ${usdBalanceDisplay.borderColor}`}>
                                  <span className="text-base">{usdBalanceDisplay.icon}</span>
                                  <span className={`text-xs font-semibold ${usdBalanceDisplay.color}`}>
                                    {usdBalanceDisplay.label}:
                                  </span>
                                  <span className={`text-sm font-bold ${usdBalanceDisplay.color}`}>
                                    {usdBalanceDisplay.text}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                      <td className={`${rtlTableCellClasses} whitespace-nowrap`}>
                        {currentStatus ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <LogIn className={`w-3 h-3 ${rtlSpacingClasses.marginRight}`} />
                            {t('customers.checkedIn')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <LogOut className={`w-3 h-3 ${rtlSpacingClasses.marginRight}`} />
                            {t('customers.checkedOut')}
                          </span>
                        )}
                      </td>
                      <td className={`${rtlTableCellClasses} whitespace-nowrap`}>
                        <div className="text-sm text-gray-900">
                          {todayHours > 0 ? `${todayHours.toFixed(2)} hrs` : '-'}
                        </div>
                      </td>
                      <td className={`${rtlTableCellClasses} whitespace-nowrap text-sm font-medium`}>
                        <div className={`flex ${rtlSpacingClasses.spaceX}`}>
                          {canPayEmployee(employee.id) && (
                            <button
                              onClick={() => {
                                setSelectedEmployee(employee.id);
                                setShowPaymentForm(true);
                              }}
                              className="text-green-600 hover:text-green-900"
                              title={t('customers.payEmployee')}
                            >
                              <DollarSign className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedEmployee(employee.id);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('customers.viewAttendance')}
                          >
                            <Calendar className="w-5 h-5" />
                          </button>
                          {onViewAccountStatement && (
                            <button
                              onClick={() => {
                                onViewAccountStatement(employee);
                              }}
                              className="text-purple-600 hover:text-purple-900"
                              title={t('customers.viewAccountStatement')}
                            >
                              <FileText className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            itemsPerPage={itemsPerPage}
            totalItems={visibleEmployees.length}
          />
        )}
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">{t('employees.payEmployee')}</h2>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="text-blue-800 font-medium">
                    {t('employees.recordAPaymentTo')} {employees.find(e => e.id === selectedEmployee)?.name}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard.amount')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    placeholder="0.00"
                  />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard.currency')} *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="USD">{t('customers.usd')} ($)</option>
                    <option value="LBP">{t('customers.lbp')} (ل.ل)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.description')} </label>
                <input
                  type="text"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('payments.description')}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentForm(false);
                    setPaymentForm({ amount: '', currency: 'USD', description: '' });
                    setSelectedEmployee(null);
                  }}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('customers.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  {t('employees.recordAPayment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance History Modal */}
      {selectedEmployee && !showPaymentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {t('customers.attendanceHistory')} - {employees.find(e => e.id === selectedEmployee)?.name}
                </h2>
                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={rtlTableHeaderClasses}>{t('customers.checkIn')}</th>
                      <th className={rtlTableHeaderClasses}>{t('customers.checkOut')}</th>
                      <th className={rtlTableHeaderClasses}>{t('customers.hours')}</th>
                      <th className={rtlTableHeaderClasses}>{t('customers.notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getEmployeeAttendance(selectedEmployee).map((att) => {
                      const hours = EmployeeAttendanceService.calculateHoursWorked(att);
                      return (
                        <tr key={att.id}>
                          <td className={`${rtlTableCellClasses} whitespace-nowrap text-sm text-gray-900`}>
                            {new Date(att.check_in_at).toLocaleString()}
                          </td>
                          <td className={`${rtlTableCellClasses} whitespace-nowrap text-sm text-gray-900`}>
                            {att.check_out_at ? new Date(att.check_out_at).toLocaleString() : '-'}
                          </td>
                          <td className={`${rtlTableCellClasses} whitespace-nowrap text-sm text-gray-900`}>
                            {hours !== null ? `${hours.toFixed(2)} hrs` : '-'}
                          </td>
                          <td className={`${rtlTableCellClasses} text-sm text-gray-900`}>
                            {att.notes || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

