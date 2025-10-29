import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { Plus, Search, Edit, Trash2, Users as UsersIcon, Clock, DollarSign, Mail, Phone, MapPin, User } from 'lucide-react';
import { Employee } from '../types';
import { EmployeeService } from '../services/employeeService';
import Toast from '../components/common/Toast';

export default function Employees() {
  const { userProfile } = useSupabaseAuth();
  const { storeId } = useOfflineData();
  const { t } = useI18n();
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [roleCounts, setRoleCounts] = useState({ cashier: 0, manager: 0 });

  // Check if user is admin
  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setToast({ message: 'Access denied. Admin role required.', type: 'error', visible: true });
      return;
    }
    loadEmployees();
  }, [storeId, isAdmin]);

  const loadEmployees = async () => {
    if (!storeId || !isAdmin) return;
    
    try {
      setLoading(true);
      const [employeesList, counts] = await Promise.all([
        EmployeeService.getEmployees(storeId),
        EmployeeService.getRoleCounts(storeId)
      ]);
      setEmployees(employeesList);
      setRoleCounts(counts);
    } catch (error) {
      console.error('Error loading employees:', error);
      setToast({ 
        message: error instanceof Error ? error.message : 'Failed to load employees', 
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
      errors.name = 'Name is required';
    }
    if (!formData.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    if (!formData.role) {
      errors.role = 'Role is required';
    }
    if (formData.phone && !/^[\d\s\-\+\(\)]+$/.test(formData.phone)) {
      errors.phone = 'Invalid phone number format';
    }
    if (formData.monthly_salary && isNaN(parseFloat(formData.monthly_salary))) {
      errors.monthly_salary = 'Salary must be a valid number';
    }
    if (formData.working_hours_start && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.working_hours_start)) {
      errors.working_hours_start = 'Invalid time format (use HH:mm)';
    }
    if (formData.working_hours_end && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.working_hours_end)) {
      errors.working_hours_end = 'Invalid time format (use HH:mm)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !storeId) return;

    try {
      if (editingEmployee) {
        await EmployeeService.updateEmployee(editingEmployee.id, formData);
        setToast({ message: 'Employee updated successfully', type: 'success', visible: true });
      } else {
        await EmployeeService.createEmployee(storeId, formData as Omit<Employee, 'id' | 'store_id' | 'created_at' | 'updated_at' | '_synced' | '_deleted'>);
        setToast({ message: 'Employee created successfully', type: 'success', visible: true });
      }
      
      resetForm();
      await loadEmployees();
    } catch (error) {
      setToast({ 
        message: error instanceof Error ? error.message : 'Failed to save employee', 
        type: 'error', 
        visible: true 
      });
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      phone: employee.phone || '',
      address: employee.address || '',
      monthly_salary: employee.monthly_salary || '',
      working_hours_start: employee.working_hours_start || '',
      working_hours_end: employee.working_hours_end || '',
      working_days: employee.working_days || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      await EmployeeService.deleteEmployee(employeeId);
      setToast({ message: 'Employee deleted successfully', type: 'success', visible: true });
      await loadEmployees();
    } catch (error) {
      setToast({ 
        message: error instanceof Error ? error.message : 'Failed to delete employee', 
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
    setEditingEmployee(null);
    setShowForm(false);
    setFormErrors({});
  };

  const filteredEmployees = employees.filter(emp => {
    const searchLower = searchTerm.toLowerCase();
    return (
      emp.name.toLowerCase().includes(searchLower) ||
      emp.email.toLowerCase().includes(searchLower) ||
      emp.role.toLowerCase().includes(searchLower) ||
      (emp.phone && emp.phone.toLowerCase().includes(searchLower))
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
          <p className="text-red-800">Access denied. This page is only available to administrators.</p>
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
            Employee Management
          </h1>
          <p className="text-gray-600 mt-1">Manage employees, roles, and working hours</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Employee
        </button>
      </div>

      {/* Role Availability Badges */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-lg border ${cashierAvailability.available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">Cashiers</span>
            <span className={`px-2 py-1 rounded text-sm ${cashierAvailability.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {cashierAvailability.current} / {cashierAvailability.max}
            </span>
          </div>
          {!cashierAvailability.available && (
            <p className="text-sm text-red-600 mt-1">Maximum cashiers reached</p>
          )}
        </div>
        <div className={`p-4 rounded-lg border ${managerAvailability.available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">Managers</span>
            <span className={`px-2 py-1 rounded text-sm ${managerAvailability.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {managerAvailability.current} / {managerAvailability.max}
            </span>
          </div>
          {!managerAvailability.available && (
            <p className="text-sm text-red-600 mt-1">Maximum managers reached</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search employees by name, email, role, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Employee Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
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
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                    required
                  />
                  {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role || 'cashier'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'cashier' | 'manager' })}
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.role ? 'border-red-500' : 'border-gray-300'}`}
                    required
                  >
                    <option value="cashier">Cashier {!cashierAvailability.available && !editingEmployee && `(Max: ${cashierAvailability.max})`}</option>
                    <option value="manager">Manager {!managerAvailability.available && !editingEmployee && `(Max: ${managerAvailability.max})`}</option>
                  </select>
                  {formErrors.role && <p className="text-red-500 text-xs mt-1">{formErrors.role}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
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
                    Monthly Salary
                  </label>
                  <input
                    type="text"
                    value={formData.monthly_salary || ''}
                    onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                    placeholder="e.g., 500.00"
                    className={`w-full px-3 py-2 border rounded-lg ${formErrors.monthly_salary ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors.monthly_salary && <p className="text-red-500 text-xs mt-1">{formErrors.monthly_salary}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Working Days
                  </label>
                  <input
                    type="text"
                    value={formData.working_days || ''}
                    onChange={(e) => setFormData({ ...formData, working_days: e.target.value })}
                    placeholder="e.g., Monday,Tuesday,Wednesday"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Working Hours Start
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
                    Working Hours End
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
                  Address
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingEmployee ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employees Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading employees...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No employees found</p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:underline mt-2"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Working Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                      {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
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
                    {employee.monthly_salary ? (
                      <div className="flex items-center text-sm text-gray-900">
                        <DollarSign className="w-4 h-4 mr-1 text-gray-400" />
                        {employee.monthly_salary}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not set</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.working_hours_start && employee.working_hours_end ? (
                      <div className="flex items-center text-sm text-gray-900">
                        <Clock className="w-4 h-4 mr-1 text-gray-400" />
                        {employee.working_hours_start} - {employee.working_hours_end}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not set</span>
                    )}
                    {employee.working_days && (
                      <div className="text-xs text-gray-500 mt-1">{employee.working_days}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        className="text-red-600 hover:text-red-900"
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

