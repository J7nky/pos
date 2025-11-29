import { useState } from 'react';
import { StoreUser, Branch, CreateUserInput, UpdateUserInput } from '../../types';
import { Button, Input, Select, Modal, ModalFooter } from '../ui';

interface UserFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  storeId: string;
  branches: Branch[];
  user?: StoreUser; // If provided, we're editing
  isLoading?: boolean;
}

export default function UserForm({
  isOpen,
  onClose,
  onSubmit,
  storeId,
  branches,
  user,
  isLoading = false,
}: UserFormProps) {
  const isEditing = !!user;

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'cashier',
    branch_id: user?.branch_id || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!isEditing && !formData.password) {
      newErrors.password = 'Password is required for new users';
    } else if (!isEditing && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.role) {
      newErrors.role = 'Role is required';
    }

    // Branch is required for non-admin roles
    if (formData.role !== 'admin' && !formData.branch_id) {
      newErrors.branch_id = 'Branch is required for this role';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (isEditing) {
      const data: UpdateUserInput = {
        name: formData.name.trim(),
        role: formData.role as 'admin' | 'manager' | 'cashier',
        branch_id: formData.role === 'admin' ? undefined : formData.branch_id || undefined,
      };
      await onSubmit(data);
    } else {
      const data: CreateUserInput = {
        store_id: storeId,
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role as 'admin' | 'manager' | 'cashier',
        branch_id: formData.role === 'admin' ? undefined : formData.branch_id || undefined,
      };
      await onSubmit(data);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }

    // Clear branch_id error when role changes to admin
    if (field === 'role' && value === 'admin' && errors.branch_id) {
      setErrors((prev) => ({ ...prev, branch_id: '' }));
    }
  };

  const roleOptions = [
    { value: 'admin', label: 'Admin - Full store access' },
    { value: 'manager', label: 'Manager - Branch management' },
    { value: 'cashier', label: 'Cashier - POS operations only' },
  ];

  const branchOptions = [
    { value: '', label: 'Select a branch' },
    ...branches
      .filter((b) => b.is_active)
      .map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit User' : 'Add New User'}
      description={
        isEditing
          ? 'Update the user information below.'
          : 'Fill in the details to create a new user for this store.'
      }
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <Input
            label="Full Name *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={errors.name}
            placeholder="John Doe"
          />

          <Input
            label="Email *"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            error={errors.email}
            placeholder="john@example.com"
            disabled={isEditing}
            helperText={isEditing ? 'Email cannot be changed' : undefined}
          />

          {!isEditing && (
            <Input
              label="Password *"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              placeholder="Minimum 6 characters"
            />
          )}

          <Select
            label="Role *"
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
            options={roleOptions}
            error={errors.role}
            helperText={
              formData.role === 'admin'
                ? 'Admins have access to all branches'
                : formData.role === 'manager'
                ? 'Managers can manage their assigned branch'
                : 'Cashiers can only perform POS operations'
            }
          />

          {formData.role !== 'admin' && (
            <Select
              label="Branch *"
              value={formData.branch_id}
              onChange={(e) => handleChange('branch_id', e.target.value)}
              options={branchOptions}
              error={errors.branch_id}
              helperText="Select the branch this user will be assigned to"
            />
          )}

          {formData.role === 'admin' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Admin users have access to all branches and
                can manage the entire store.
              </p>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Add User'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
