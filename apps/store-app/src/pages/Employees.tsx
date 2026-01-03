import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Plus, Search, Edit, Trash2, Users as UsersIcon, Clock, DollarSign, Phone, MapPin, User, Calendar, Shield } from 'lucide-react';
import { Employee } from '../types';
import { EmployeeService } from '../services/employeeService';
import Toast from '../components/common/Toast';
import { ModuleAccessManager } from '../components/rbac/ModuleAccessManager';
import { useI18n } from '../i18n';
import { normalizeNameForComparison } from '../utils/nameNormalization';

export default function Employees() {
  const { userProfile } = useSupabaseAuth();
  const { storeId, employees, updateEmployee, deleteEmployee } = useOfflineData();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });
  const { t } = useI18n();
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    email: '',
    role: 'cashier',
    phone: '',
    address: '',
    monthly_salary: '',
    working_hours_start: '',
    working_hours_end: '',
    working_days: '',
  });
  const [password, setPassword] = useState<string>('');
  const [salaryCurrency, setSalaryCurrency] = useState<'LBP' | 'USD'>('LBP');
  const [salaryValue, setSalaryValue] = useState<string>('');
  const [showWorkingDaysModal, setShowWorkingDaysModal] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const [roleCounts, setRoleCounts] = useState({ cashier: 0, manager: 0 });
  const [activeTab, setActiveTab] = useState<'info' | 'modules'>('info');

  // Check if user is admin
  const isAdmin = userProfile?.role === 'admin';
console.log(userProfile,123123123);
  useEffect(() => {
    if (!isAdmin) {
      setToast({ message: t('employees.accessDenied'), type: 'error', visible: true });
      return;
    }
    loadEmployees();
  }, [storeId, isAdmin, employees]);

  const loadEmployees = async () => {
    if (!storeId || !isAdmin) return;
    
    try {
      setLoading(true);
      console.log('🔄 Loading employees for store:', storeId);
      // Employees are now loaded from context, just calculate role counts
      const counts = await EmployeeService.getRoleCounts(storeId);
      console.log('✅ Loaded employees:', employees.length, 'employees');
      setRoleCounts(counts);
    } catch (error) {
      console.error('❌ Error loading employees:', error);
      setToast({ 
        message: error instanceof Error ? error.message : t('employees.employeeListFailed'), 
        type: 'error', 
        visible: true 
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      errors.name = t('employees.nameRequired');
    }
    if (!formData.email?.trim()) {
      errors.email = t('employees.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('employees.invalidEmailFormat');
    }
    if (!editingEmployee && (!password || password.length < 6)) {
      errors.password = t('employees.passwordRequired');
    }
    if (!formData.role) {
      errors.role = t('employees.roleRequired');
    }
    if (formData.phone && !/^[\d\s\-\+\(\)]+$/.test(formData.phone)) {
      errors.phone = t('employees.invalidPhoneNumberFormat');
    }
    if (salaryValue && isNaN(parseFloat(salaryValue))) {
      errors.monthly_salary = t('employees.salaryMustBeValidNumber');
    }
    if (formData.working_hours_start && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.working_hours_start)) {
      errors.working_hours_start = t('employees.invalidTimeFormat');
    }
    if (formData.working_hours_end && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.working_hours_end)) {
      errors.working_hours_end = t('employees.invalidTimeFormat');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !storeId) return;

    try {
      // NOTE: Employee balance fields (lbp_balance/usd_balance) store monthly salary configuration,
      // NOT running balances like customers/suppliers. Employees don't have AR/AP accounts.
      // Employee payments are tracked via journal entries (account 5200 - Salaries Expense).
      const balanceValue = salaryValue && salaryValue.trim() !== '' ? parseFloat(salaryValue) : null;
      const balanceData = {
        lbp_balance: salaryCurrency === 'LBP' ? balanceValue : null,
        usd_balance: salaryCurrency === 'USD' ? balanceValue : null,
      };

      // Clean formData - convert empty strings to null for optional fields
      const cleanedFormData: any = {};
      for (const [key, value] of Object.entries(formData)) {
        if (key === 'name' || key === 'email' || key === 'role') {
          // Required fields - keep as is
          cleanedFormData[key] = value;
        } else if (typeof value === 'string' && value.trim() === '') {
          // Optional fields - convert empty strings to null
          cleanedFormData[key] = null;
        } else {
          cleanedFormData[key] = value;
        }
      }

      const employeeData = {
        ...cleanedFormData,
        ...balanceData,
      };

      console.log('📝 Submitting employee data:', {
        isEdit: !!editingEmployee,
        employeeId: editingEmployee?.id,
        employeeData
      });

      if (editingEmployee) {
        // Validate role limits if role is being changed
        if (employeeData.role && employeeData.role !== editingEmployee.role) {
          const existingEmployees = employees.filter(emp => emp.role === employeeData.role && emp.id !== editingEmployee.id);
          const maxAllowed = employeeData.role === 'cashier' ? 2 : 1;
          if (existingEmployees.length >= maxAllowed) {
            throw new Error(`Cannot change role to ${employeeData.role}. Maximum allowed: ${maxAllowed}`);
          }
        }
        
        // Check name uniqueness if name is being changed (with Arabic normalization)
        const normalizedInput = normalizeNameForComparison(employeeData.name || '');
        const normalizedExisting = normalizeNameForComparison(editingEmployee.name);
        if (employeeData.name && normalizedInput !== normalizedExisting) {
          const existingByName = employees.find(emp => {
            const normalizedEmpName = normalizeNameForComparison(emp.name);
            return normalizedInput === normalizedEmpName && emp.id !== editingEmployee.id;
          });
          if (existingByName) {
            const errorMsg = t('employees.duplicateNameError') || 'An employee with this name already exists';
            setNameValidationError(errorMsg);
            throw new Error(errorMsg);
          }
        }
        
        // Check email uniqueness if email is being changed
        if (employeeData.email && employeeData.email !== editingEmployee.email) {
          const existingByEmail = employees.find(emp => emp.email === employeeData.email && emp.id !== editingEmployee.id);
          if (existingByEmail) {
            throw new Error('An employee with this email already exists');
          }
        }
        
        await updateEmployee(editingEmployee.id, employeeData);
        setToast({ message: t('employees.employeeUpdatedSuccessfully'), type: 'success', visible: true });
      } else {
        // Validate role limits for new employee
        const existingEmployees = employees.filter(emp => emp.role === employeeData.role);
        const maxAllowed = (employeeData.role as 'cashier' | 'manager') === 'cashier' ? 2 : 1;
        if (existingEmployees.length >= maxAllowed) {
          throw new Error(`Cannot add more ${employeeData.role}s. Maximum allowed: ${maxAllowed}`);
        }
        
        // Check name uniqueness (with Arabic normalization)
        const normalizedInput = normalizeNameForComparison(employeeData.name || '');
        const existingByName = employees.find(emp => {
          const normalizedEmpName = normalizeNameForComparison(emp.name);
          return normalizedInput === normalizedEmpName;
        });
        if (existingByName) {
          const errorMsg = t('employees.duplicateNameError') || 'An employee with this name already exists';
          setNameValidationError(errorMsg);
          throw new Error(errorMsg);
        }
        
        // Check email uniqueness
        const existingByEmail = employees.find(emp => emp.email === employeeData.email);
        if (existingByEmail) {
          throw new Error('An employee with this email already exists');
        }
        
        // Create employee with auth user using the service
        await EmployeeService.createEmployeeWithAuth(storeId, employeeData as any, password);
        setToast({ message: t('employees.employeeCreatedSuccessfullyWithLoginCredentials'), type: 'success', visible: true });
      }
      
      resetForm();
      // No need to reload, context will auto-update
    } catch (error) {
      console.error('❌ Error saving employee:', error);
      setToast({ 
        message: error instanceof Error ? error.message : t('employees.employeeCreatedFailed'), 
        type: 'error', 
        visible: true 
      });
    }
  };

  const handleEdit = (employee: Employee) => {
    console.log('✏️ Editing employee:', employee);
    setEditingEmployee(employee);
    // Clear any existing errors
    setFormErrors({});
    setActiveTab('info'); // Reset to info tab
    
    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role || 'cashier', // Fallback to cashier if role is undefined
      phone: employee.phone || '',
      address: employee.address || '',
      monthly_salary: employee.monthly_salary || '',
      working_hours_start: employee.working_hours_start || '',
      working_hours_end: employee.working_hours_end || '',
      working_days: employee.working_days || '',
    });
    setNameValidationError(null);
    
    // Set currency and value based on existing balance
    if (employee.lbp_balance !== null && employee.lbp_balance !== undefined) {
      setSalaryCurrency('LBP');
      setSalaryValue(employee.lbp_balance.toString());
    } else if (employee.usd_balance !== null && employee.usd_balance !== undefined) {
      setSalaryCurrency('USD');
      setSalaryValue(employee.usd_balance.toString());
    } else {
      setSalaryCurrency('LBP');
      setSalaryValue('');
    }
    
    setShowForm(true);
  };

  const handleDelete = async (employeeId: string) => {
    // Find the employee being deleted
    const employeeToDelete = employees.find(emp => emp.id === employeeId);
    
    // Prevent admin from deleting themselves
    if (employeeToDelete && employeeToDelete.email === userProfile?.email) {
      setToast({ 
        message: t('employees.cannotDeleteYourOwnAccount'), 
        type: 'error', 
        visible: true 
      });
      return;
    }

    if (!confirm(t('employees.areYouSureYouWantToDeleteThisEmployee'))) return;

    try {
      await deleteEmployee(employeeId);
      setToast({ message: t('employees.employeeDeletedSuccessfully'), type: 'success', visible: true });
      // No need to reload, context will auto-update
    } catch (error) {
      setToast({ 
        message: error instanceof Error ? error.message : t('employees.employeeDeletedFailed'), 
        type: 'error', 
        visible: true 
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'cashier',
      phone: '',
      address: '',
      monthly_salary: '',
      working_hours_start: '',
      working_hours_end: '',
      working_days: '',
    });
    setPassword('');
    setSalaryCurrency('LBP');
    setSalaryValue('');
    setEditingEmployee(null);
    setShowForm(false);
    setFormErrors({});
    setNameValidationError(null);
  };

  const filteredEmployees = employees.filter(emp => {
    if (!searchTerm) return true;
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);
    return (
      normalizeNameForComparison(emp.name).includes(normalizedSearchTerm) ||
      normalizeNameForComparison(emp.email).includes(normalizedSearchTerm) ||
      normalizeNameForComparison(emp.role).includes(normalizedSearchTerm) ||
      (emp.phone && normalizeNameForComparison(emp.phone).includes(normalizedSearchTerm))
    );
  });

  // Check role availability
  const getRoleAvailability = (role: 'cashier' | 'manager') => {
    const max = role === 'cashier' ? 2 : 1;
    const current = roleCounts[role];
    return { current, max, available: current < max };
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{t('employees.accessDenied')}</p>
        </div>
      </div>
    );
  }

  const cashierAvailability = getRoleAvailability('cashier');
  const managerAvailability = getRoleAvailability('manager');

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <UsersIcon className="w-7 h-7 mr-2" />
            {t('employees.title')}
          </h1>
          <p className="text-gray-600 mt-1">{t('employees.description')}</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setActiveTab('info');
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('employees.addEmployee')}
        </button>
      </div>

      {/* Role Availability Badges */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-lg border ${cashierAvailability.available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">{t('employees.cashiers')}</span>
            <span className={`px-2 py-1 rounded text-sm ${cashierAvailability.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {cashierAvailability.current} / {cashierAvailability.max}
            </span>
          </div>
          {!cashierAvailability.available && (
            <p className="text-sm text-red-600 mt-1">{t('employees.maximumCashiersReached')}</p>
          )}
        </div>
        <div className={`p-4 rounded-lg border ${managerAvailability.available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">{t('employees.managers')}</span>
            <span className={`px-2 py-1 rounded text-sm ${managerAvailability.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {managerAvailability.current} / {managerAvailability.max}
            </span>
          </div>
          {!managerAvailability.available && (
            <p className="text-sm text-red-600 mt-1">{t('employees.maximumManagersReached')}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder={t('employees.employeeSearch')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Employee Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingEmployee ? t('employees.editEmployee') : t('employees.addNewEmployee')}
            </h2>

            {/* Tabs - Only show for editing existing employee */}
            {editingEmployee && (
              <div className="flex border-b border-gray-200 mb-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === 'info'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <User className="w-4 h-4 inline mr-2" />
                  {t('employees.employeeInfo')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('modules')}
                  className={`px-4 py-2 font-medium text-sm transition-colors ${
                    activeTab === 'modules'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Shield className="w-4 h-4 inline mr-2" />
                  {t('employees.employeeModuleAccess')}
                </button>
              </div>
            )}

            {/* Tab Content: Employee Info */}
            {(!editingEmployee || activeTab === 'info') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.name')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.name ? 'border-red-500' : 'border-gray-300'}`}
                    required
                  />
                  {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.email')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                    required
                    disabled={!!editingEmployee}
                  />
                  {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                    {editingEmployee && <p className="text-xs text-gray-500 mt-1">{t('employees.emailCannotBeChanged')}</p>}
                </div>

                {!editingEmployee && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('employees.password')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg ${formErrors.password ? 'border-red-500' : 'border-gray-300'}`}
                      required
                      minLength={6}
                      placeholder={t('employees.minimum6Characters')}
                    />
                    {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                    <p className="text-xs text-gray-500 mt-1">{t('employees.employeeWillUseThisPasswordToLogIn')}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.role')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role || 'cashier'}
                    onChange={(e) => {
                      setFormData({ ...formData, role: e.target.value as 'cashier' | 'manager' });
                      // Clear role error if it exists
                      if (formErrors.role) {
                        const newErrors = { ...formErrors };
                        delete newErrors.role;
                        setFormErrors(newErrors);
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.role ? 'border-red-500' : 'border-gray-300'}`}
                    required
                  >
                    <option value="cashier">{t('employees.cashier')} {!cashierAvailability.available && !editingEmployee && `(Max: ${cashierAvailability.max})`}</option>
                    <option value="manager">{t('employees.manager')} {!managerAvailability.available && !editingEmployee && `(Max: ${managerAvailability.max})`}</option>
                  </select>
                  {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.phone')}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.phone ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.monthlySalary')}
                  </label>
                  <input
                    type="text"
                    value={salaryValue}
                    onChange={(e) => {
                      setSalaryValue(e.target.value);
                      if (formErrors.monthly_salary) {
                        const newErrors = { ...formErrors };
                        delete newErrors.monthly_salary;
                        setFormErrors(newErrors);
                      }
                    }}
                    placeholder="e.g., 500.00"
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.monthly_salary ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors.monthly_salary && <p className="text-red-500 text-xs mt-1">{formErrors.monthly_salary}</p>}
                  
                  {/* Currency Toggle Switch */}
                  <div className="mt-3 flex items-center justify-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setSalaryCurrency('LBP')}
                      className={`flex-1 py-2 px-4 rounded-md font-medium text-sm transition-all duration-200 ${
                        salaryCurrency === 'LBP'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      LBP
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalaryCurrency('USD')}
                      className={`flex-1 py-2 px-4 rounded-md font-medium text-sm transition-all duration-200 ${
                        salaryCurrency === 'USD'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      USD
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('employees.workingDays')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={formData.working_days ? formData.working_days.split(',').filter(d => d.trim()).join(', ') : ''}
                      onClick={() => setShowWorkingDaysModal(true)}
                      placeholder={t('employees.clickToSelectWorkingDays')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                  {formData.working_days && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.working_days.split(',').filter(d => d.trim()).length} {t('employees.daysSelected')}
                    </p>
                  )}
                </div>

                {/* Working Days Selection Modal */}
                {showWorkingDaysModal && (
                  <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowWorkingDaysModal(false);
                      }
                    }}
                  >
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                      <div className="p-6 border-b">
                        <h3 className="text-lg font-semibold text-gray-900">{t('employees.selectWorkingDays')}</h3>
                      </div>
                      <div className="p-6">
                        <div className=" gap-3">
                          {[t('employees.monday'), t('employees.tuesday'), t('employees.wednesday'), t('employees.thursday'), t('employees.friday'), t('employees.saturday'), t('employees.sunday')].map((day) => {
                            const currentDays = formData.working_days ? formData.working_days.split(',').map(d => d.trim()) : [];
                            const isChecked = currentDays.includes(day);
                            return (
                              <label key={day} className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let updatedDays = [...currentDays];
                                    if (e.target.checked) {
                                      if (!updatedDays.includes(day)) {
                                        updatedDays.push(day);
                                      }
                                    } else {
                                      updatedDays = updatedDays.filter(d => d !== day);
                                    }
                                    setFormData({ ...formData, working_days: updatedDays.join(',') });
                                  }}
                                  className="w-4 h-4 text-blue-600 text-lg  border-gray-300 rounded focus:ring-blue-500 ml-2"
                                />
                                <span className="text-sm text-gray-700 mr-2">{day}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="p-6 border-t flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowWorkingDaysModal(false)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          {t('employees.done')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.workingHoursStart')}
                  </label>
                  <input
                    type="time"
                    value={formData.working_hours_start || ''}
                    onChange={(e) => setFormData({ ...formData, working_hours_start: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.working_hours_start ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors.working_hours_start && <p className="text-red-500 text-xs mt-1">{formErrors.working_hours_start}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employees.workingHoursEnd')}
                  </label>
                  <input
                    type="time"
                    value={formData.working_hours_end || ''}
                    onChange={(e) => setFormData({ ...formData, working_hours_end: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.working_hours_end ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors.working_hours_end && <p className="text-red-500 text-xs mt-1">{formErrors.working_hours_end}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('employees.address')}
                </label>
                <textarea
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('employees.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingEmployee ? t('employees.update') : t('employees.create')}
                </button>
              </div>
            </form>
            )}

            {/* Tab Content: Module Access */}
            {editingEmployee && activeTab === 'modules' && (
              <div className="py-4">
                <ModuleAccessManager
                  userId={editingEmployee.id}
                  userRole={editingEmployee.role}
                  storeId={storeId || ''}
                  onUpdate={() => {
                    // Optionally reload employees or show success message
                    setToast({ message: t('employees.moduleAccessUpdatedSuccessfully'), type: 'success', visible: true });
                  }}
                />
                
                {/* Close button for tabs */}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingEmployee(null);
                      setActiveTab('info');
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    {t('employees.close')}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Employees Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('employees.loadingEmployees')}</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{t('employees.noEmployeesFound')}</p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:underline mt-2"
            >
              {t('employees.clearSearch')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.name')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.role')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.contact')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.salary')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.workingHours')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        <div className="text-sm text-gray-500">{employee.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      employee.role === 'manager' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {employee.role ? employee.role.charAt(0).toUpperCase() + employee.role.slice(1) : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {employee.phone && (
                        <div className="flex items-center">
                          <Phone className="w-4 h-4 mr-1 text-gray-400" />
                          {employee.phone}
                        </div>
                      )}
                      {employee.address && (
                        <div className="flex items-center mt-1">
                          <MapPin className="w-4 h-4 mr-1 text-gray-400" />
                          <span className="text-xs text-gray-500 truncate max-w-xs">{employee.address}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {/* Display monthly salary configuration (not a running balance) */}
                    {employee.lbp_balance !== null && employee.lbp_balance !== undefined ? (
                      <div className="flex items-center text-sm text-gray-900">
                        <DollarSign className="w-4 h-4  text-gray-400" />
                        {employee.lbp_balance.toLocaleString()} LBP
                      </div>
                    ) : employee.usd_balance !== null && employee.usd_balance !== undefined ? (
                      <div className="flex items-center text-sm text-gray-900">
                        <DollarSign className="w-4 h-4  text-gray-400" />
                        {employee.usd_balance.toLocaleString()} USD
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{t('employees.notSet')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.working_hours_start && employee.working_hours_end ? (
                      <div className="flex items-center text-sm text-gray-900">
                        <Clock className="w-4 h-4 mr-1 text-gray-400" />
                        {employee.working_hours_start} - {employee.working_hours_end}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{t('employees.notSet')}</span>
                    )}
                    {employee.working_days && (
                      <div className="text-xs text-gray-500 mt-1">{employee.working_days}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(employee as Employee)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        disabled={employee.email === userProfile?.email}
                        className={`${
                          employee.email === userProfile?.email
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-red-600 hover:text-red-900'
                        }`}
                        title={employee.email === userProfile?.email ? t('employees.youCannotDeleteYourOwnAccount') : t('employees.deleteEmployee')}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
    </div>
  );
}

