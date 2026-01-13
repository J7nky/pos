import React, { useState, useRef, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Table } from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { balanceMigrationService } from '../services/balanceMigrationService';
import { getStores } from '../services/storeService';
import { getBranches } from '../services/branchService';

interface MigrationRow {
  id: string;
  entityName: string;
  entityType: 'customer' | 'supplier';
  debitBalance: number;
  creditBalance: number;
  status: 'pending' | 'imported' | 'error';
  errorMessage?: string;
}


interface MigrationSession {
  id: string;
  storeId: string;
  branchId: string;
  filename: string;
  uploadedAt: string;
  status: 'uploading' | 'validating' | 'previewing' | 'importing' | 'completed' | 'failed';
  totalRows: number;
  validRows: number;
  importedRows: number;
  errorRows: number;
  rows: MigrationRow[];
}

interface Store {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function BalanceMigration() {
  const { } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentSession, setCurrentSession] = useState<MigrationSession | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<MigrationRow> | null>(null);
  const toast = useToast();

  // Load stores on component mount
  useEffect(() => {
    loadStores();
  }, []);

  // Load branches when store is selected
  useEffect(() => {
    if (selectedStoreId) {
      loadBranches(selectedStoreId);
    } else {
      setBranches([]);
      setSelectedBranchId('');
    }
  }, [selectedStoreId]);

  const loadStores = async () => {
    try {
      const storesData = await getStores();
      setStores(storesData.map(store => ({ id: store.id, name: store.name })));
    } catch (error) {
      console.error('Error loading stores:', error);
      toast.error('Failed to load stores');
    } finally {
      setIsLoadingStores(false);
    }
  };

  const loadBranches = async (storeId: string) => {
    setIsLoadingBranches(true);
    try {
      const branchesData = await getBranches(storeId);
      setBranches(branchesData.filter(branch => branch.is_active));
    } catch (error) {
      console.error('Error loading branches:', error);
      toast.error('Failed to load branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - only CSV accepted
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file (.csv) exported from Access database');
      return;
    }

    if (!selectedStoreId || !selectedBranchId) {
      toast.error('Please select a store and branch first');
      return;
    }

    setIsUploading(true);
    try {
      const session = await balanceMigrationService.createMigrationSession(
        selectedStoreId,
        selectedBranchId,
        file.name
      );

      // Parse legacy mchar.csv format
      console.log('Parsing legacy mchar.csv format...');
      const parsedData = await balanceMigrationService.parseMcharFile(file);

      const validationResult = await balanceMigrationService.validateMigrationData(parsedData);

      // Filter duplicates: keep only the entity with the highest amount for each name
      const entityMap = new Map<string, typeof validationResult.validRows[0]>();
      
      validationResult.validRows.forEach(row => {
        const entityName = row.entityName.trim();
        const currentAmount = Math.abs(row.debitBalance) + Math.abs(row.creditBalance);
        
        const existing = entityMap.get(entityName);
        if (!existing) {
          entityMap.set(entityName, row);
        } else {
          const existingAmount = Math.abs(existing.debitBalance) + Math.abs(existing.creditBalance);
          if (currentAmount > existingAmount) {
            entityMap.set(entityName, row);
          }
        }
      });

      const uniqueRows = Array.from(entityMap.values());
      const duplicateCount = validationResult.validRows.length - uniqueRows.length;

      const rows: MigrationRow[] = uniqueRows.map((row, index) => ({
        id: `row-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        entityName: row.entityName,
        entityType: row.entityType,
        debitBalance: row.debitBalance,
        creditBalance: row.creditBalance,
        status: 'pending' as const
      }));

      // Add error rows
      validationResult.errors.forEach((error, index) => {
        rows.push({
          id: `error-${Date.now()}-${rows.length + index}-${Math.random().toString(36).substr(2, 9)}`,
          entityName: error.row.entityName || 'Unknown',
          entityType: error.row.entityType || 'customer',
          debitBalance: error.row.debitBalance || 0,
          creditBalance: error.row.creditBalance || 0,
          status: 'error',
          errorMessage: error.message
        });
      });

      const updatedSession: MigrationSession = {
        ...session,
        status: 'previewing',
        totalRows: rows.length,
        validRows: uniqueRows.length,
        importedRows: 0,
        errorRows: validationResult.errors.length,
        rows
      };

      setCurrentSession(updatedSession);
      
      let successMessage = `File uploaded successfully. Found ${validationResult.validRows.length} valid entities`;
      if (duplicateCount > 0) {
        successMessage += ` (${duplicateCount} duplicates removed, keeping highest amounts)`;
      }
      successMessage += `. ${uniqueRows.length} unique entities to import`;
      if (validationResult.errors.length > 0) {
        successMessage += `, ${validationResult.errors.length} errors`;
      }
      toast.success(successMessage);

    } catch (error) {
      console.error('File upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImport = async () => {
    if (!currentSession) return;

    setIsImporting(true);
    setShowConfirmDialog(false);

    try {
      const pendingRows = currentSession.rows.filter(r => r.status === 'pending');
      console.log('Starting migration with rows:', pendingRows.length);
      
      const result = await balanceMigrationService.executeMigration(
        currentSession.id,
        pendingRows
      );

      console.log('Migration result:', result);

      // Update session status and show error details on failed rows
      setCurrentSession(prev => prev ? {
        ...prev,
        status: result.importedCount > 0 ? 'completed' : 'failed',
        importedRows: result.importedCount,
        errorRows: result.errors.length,
        rows: prev.rows.map(row => {
          // Check if this row was imported
          const importedRow = result.importedRows.find(r =>
            r.entityName === row.entityName && r.entityType === row.entityType
          );
          if (importedRow) {
            return { ...row, status: 'imported' as const };
          }
          
          // Check if this row had an error
          const errorForRow = result.errors.find(err => 
            err.includes(row.entityName)
          );
          if (errorForRow && row.status === 'pending') {
            return { ...row, status: 'error' as const, errorMessage: errorForRow };
          }
          
          return row;
        })
      } : null);

      // Show appropriate message based on results
      if (result.importedCount > 0 && result.errors.length === 0) {
        toast.success(`Migration completed! Imported ${result.importedCount} balances successfully.`);
      } else if (result.importedCount > 0 && result.errors.length > 0) {
        toast.warning(`Partial migration: Imported ${result.importedCount} balances, ${result.errors.length} failed.`);
      } else if (result.errors.length > 0) {
        // Show the first error message
        const firstError = result.errors[0];
        toast.error(`Migration failed: ${firstError}`);
        console.error('All migration errors:', result.errors);
      } else {
        toast.error('Migration completed but no rows were imported.');
      }

    } catch (error) {
      console.error('Import error:', error);
      setCurrentSession(prev => prev ? { ...prev, status: 'failed' } : null);
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClear = () => {
    setCurrentSession(null);
    setEditingRowId(null);
    setEditFormData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEditRow = (row: MigrationRow) => {
    // Don't allow editing imported or error rows
    if (row.status === 'imported' || row.status === 'error') {
      toast.error('Cannot edit imported or error rows');
      return;
    }
    setEditingRowId(row.id);
    setEditFormData({
      entityName: row.entityName,
      entityType: row.entityType,
      debitBalance: row.debitBalance,
      creditBalance: row.creditBalance
    });
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditFormData(null);
  };

  const handleSaveEdit = () => {
    if (!currentSession || !editingRowId || !editFormData) return;

    // Validate edited data
    const errors: string[] = [];

    if (!editFormData.entityName || editFormData.entityName.trim() === '') {
      errors.push('Entity name is required');
    }

    if (!['customer', 'supplier'].includes(editFormData.entityType || '')) {
      errors.push('Entity type must be customer or supplier');
    }

    const debitBalance = Number(editFormData.debitBalance) || 0;
    const creditBalance = Number(editFormData.creditBalance) || 0;

    if (debitBalance === 0 && creditBalance === 0) {
      errors.push('At least one balance must be non-zero');
    }

    if (debitBalance !== 0 && creditBalance !== 0) {
      errors.push('Only one balance (debit or credit) can be non-zero');
    }

    if (editFormData.entityType === 'supplier' && creditBalance !== 0) {
      errors.push('Suppliers cannot have credit balances');
    }

    if (editFormData.entityType === 'customer' && debitBalance !== 0) {
      errors.push('Customers cannot have debit balances');
    }

    if (debitBalance < 0 || creditBalance < 0) {
      errors.push('Balances cannot be negative');
    }

    if (errors.length > 0) {
      toast.error(errors.join('; '));
      return;
    }

    // Update the row
    const updatedRows = currentSession.rows.map(row => {
      if (row.id === editingRowId) {
        const updatedRow: MigrationRow = {
          ...row,
          entityName: editFormData.entityName!.trim(),
          entityType: editFormData.entityType!,
          debitBalance: debitBalance,
          creditBalance: creditBalance,
          status: 'pending',
          errorMessage: undefined
        };
        return updatedRow;
      }
      return row;
    });

    // Recalculate valid/invalid rows
    const validRows = updatedRows.filter(r => r.status === 'pending');
    const errorRows = updatedRows.filter(r => r.status === 'error');

    setCurrentSession({
      ...currentSession,
      rows: updatedRows,
      validRows: validRows.length,
      errorRows: errorRows.length,
      totalRows: updatedRows.length
    });

    setEditingRowId(null);
    setEditFormData(null);
    toast.success('Row updated successfully');
  };

  const handleDeleteRow = (rowId: string) => {
    if (!currentSession) return;

    const row = currentSession.rows.find(r => r.id === rowId);
    if (!row) return;

    // Don't allow deleting imported rows
    if (row.status === 'imported') {
      toast.error('Cannot delete imported rows');
      return;
    }

    // Remove the row
    const updatedRows = currentSession.rows.filter(r => r.id !== rowId);

    // Recalculate counts
    const validRows = updatedRows.filter(r => r.status === 'pending');
    const errorRows = updatedRows.filter(r => r.status === 'error');

    setCurrentSession({
      ...currentSession,
      rows: updatedRows,
      validRows: validRows.length,
      errorRows: errorRows.length,
      totalRows: updatedRows.length
    });

    // Clear edit state if we deleted the row being edited
    if (editingRowId === rowId) {
      setEditingRowId(null);
      setEditFormData(null);
    }

    toast.success('Row deleted');
  };

  const getStatusBadge = (status: MigrationRow['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'imported':
        return <Badge variant="success">Imported</Badge>;
      case 'error':
        return <Badge variant="danger">Error</Badge>;
      default:
        return <Badge variant="default">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Legacy Balance Migration</h1>
          <p className="text-gray-600">Import opening balances from Access database (mchar.csv)</p>
        </div>
      </div>

      {/* Store and Branch Selection */}
      <Card className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Select Store and Branch</h3>
        </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Store
              </label>
              <Select
                value={selectedStoreId}
                onChange={(e) => {setSelectedStoreId(e.target.value);handleClear();}}
                disabled={isLoadingStores}
                placeholder={isLoadingStores ? "Loading stores..." : "Select a store"}
                options={stores.map((store) => ({ value: store.id, label: store.name }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch
              </label>
              <Select
                value={selectedBranchId}
                onChange={(e) => {setSelectedBranchId(e.target.value);handleClear();}}
                disabled={!selectedStoreId || isLoadingBranches}
                placeholder={
                  !selectedStoreId
                    ? "Select a store first"
                    : isLoadingBranches
                    ? "Loading branches..."
                    : "Select a branch"
                }
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              />
            </div>
          </div>
      </Card>

      {/* File Upload Section */}
      <Card className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Upload Legacy CSV File</h3>
        </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Legacy CSV File (mchar.csv from Access)
              </label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="max-w-md"
              />
              <p className="text-sm text-gray-500 mt-1">
                Legacy CSV must contain columns: id, account, description, fia, typex, address, tel, FAX, curr, ydfamt, ycfamt, ydbamt1, ycbamt1, ydbamt2, ycbamt2 (extra columns OK)
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Supported format: CSV (.csv) exported from Access database
              </p>
              <p className="text-sm text-blue-600 mt-1">
                ℹ️ Only entities with fia=4 and balances with absolute value &gt;= 1 will be imported. Currency: LBP
              </p>
            </div>

            {isUploading && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">Uploading and validating file...</span>
              </div>
            )}
          </div>
      </Card>

      {/* Migration Preview */}
      {currentSession && (
        <Card>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Migration Preview</h3>
              <p className="text-sm text-gray-600">
                File: {currentSession.filename} | Total: {currentSession.totalRows} rows |
                Valid: {currentSession.validRows} | Errors: {currentSession.errorRows}
              </p>
            </div>
            <div className="flex space-x-2">
                {currentSession.status === 'previewing' && currentSession.validRows > 0 && (
                  <Button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={isImporting}
                    variant="primary"
                  >
                    {isImporting ? 'Importing...' : 'Import Balances'}
                  </Button>
                )}
                <Button onClick={handleClear} variant="secondary">
                  Clear
                </Button>
              </div>
            </div>
        <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <th>Entity Name</th>
                    <th>Type</th>
                    <th>Debit Balance</th>
                    <th>Credit Balance</th>
                    <th>Status</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSession.rows.map((row) => {
                    const isEditing = editingRowId === row.id;
                    
                    return (
                      <tr key={row.id}>
                        <td>
                          {isEditing ? (
                            <Input
                              type="text"
                              value={editFormData?.entityName || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, entityName: e.target.value })}
                              className="min-w-[150px]"
                            />
                          ) : (
                            <span className="font-medium" dir="auto">{row.entityName}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <Select
                              value={editFormData?.entityType || 'customer'}
                              onChange={(e) => setEditFormData({ ...editFormData, entityType: e.target.value as 'customer' | 'supplier' })}
                              options={[
                                { value: 'customer', label: 'Customer' },
                                { value: 'supplier', label: 'Supplier' }
                              ]}
                            />
                          ) : (
                            <Badge variant={row.entityType === 'customer' ? 'info' : 'warning'}>
                              {row.entityType}
                            </Badge>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editFormData?.debitBalance || 0}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setEditFormData({ 
                                  ...editFormData, 
                                  debitBalance: value,
                                  creditBalance: value > 0 ? 0 : editFormData?.creditBalance
                                });
                              }}
                              min="0"
                              step="0.01"
                              className="w-24 text-right"
                            />
                          ) : (
                            <span className="text-right">
                              {row.debitBalance > 0 ? `${row.debitBalance.toLocaleString()} LBP` : '-'}
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editFormData?.creditBalance || 0}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setEditFormData({ 
                                  ...editFormData, 
                                  creditBalance: value,
                                  debitBalance: value > 0 ? 0 : editFormData?.debitBalance
                                });
                              }}
                              min="0"
                              step="0.01"
                              className="w-24 text-right"
                            />
                          ) : (
                            <span className="text-right">
                              {row.creditBalance > 0 ? `${row.creditBalance.toLocaleString()} LBP` : '-'}
                            </span>
                          )}
                        </td>
                        <td>{getStatusBadge(row.status)}</td>
                        <td>
                          {row.errorMessage && (
                            <span className="text-red-600 text-sm">{row.errorMessage}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="flex space-x-2">
                              <Button
                                onClick={handleSaveEdit}
                                variant="primary"
                                size="sm"
                              >
                                Save
                              </Button>
                              <Button
                                onClick={handleCancelEdit}
                                variant="secondary"
                                size="sm"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex space-x-2">
                              {row.status === 'pending' && (
                                <>
                                  <Button
                                    onClick={() => handleEditRow(row)}
                                    variant="secondary"
                                    size="sm"
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteRow(row.id)}
                                    variant="danger"
                                    size="sm"
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                              {(row.status === 'imported' || row.status === 'error') && (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleImport}
        title="Confirm Balance Import"
        message={`Are you sure you want to import ${currentSession?.validRows || 0} balances? This action cannot be undone.`}
        confirmText="Import Balances"
        cancelText="Cancel"
        variant="danger"
      />

    </div>
  );
}
