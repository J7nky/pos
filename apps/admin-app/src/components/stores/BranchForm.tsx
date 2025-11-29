import { useState } from 'react';
import { Branch, CreateBranchInput, UpdateBranchInput } from '../../types';
import { Button, Input, Modal, ModalFooter } from '../ui';

interface BranchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateBranchInput | UpdateBranchInput) => Promise<void>;
  storeId: string;
  branch?: Branch; // If provided, we're editing
  isLoading?: boolean;
}

export default function BranchForm({
  isOpen,
  onClose,
  onSubmit,
  storeId,
  branch,
  isLoading = false,
}: BranchFormProps) {
  const isEditing = !!branch;

  const [formData, setFormData] = useState({
    name: branch?.name || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Branch name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (isEditing) {
      const data: UpdateBranchInput = {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      };
      await onSubmit(data);
    } else {
      const data: CreateBranchInput = {
        store_id: storeId,
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      };
      await onSubmit(data);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Branch' : 'Add New Branch'}
      description={
        isEditing
          ? 'Update the branch information below.'
          : 'Fill in the details to create a new branch for this store.'
      }
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <Input
            label="Branch Name *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={errors.name}
            placeholder="e.g., Main Branch, Downtown Location"
          />
          <Input
            label="Address"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Branch address"
          />
          <Input
            label="Phone"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+961 XX XXX XXX"
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Add Branch'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
