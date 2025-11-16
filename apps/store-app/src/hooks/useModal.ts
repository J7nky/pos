import { useState, useCallback } from 'react';

/**
 * Custom hook for managing modal state
 * 
 * @template T - Type of data to be passed to the modal
 * @returns Object with modal state and control functions
 * 
 * @example
 * const modal = useModal<User>();
 * 
 * // Open modal with data
 * modal.open(userData);
 * 
 * // Access modal state
 * <Modal isOpen={modal.isOpen} onClose={modal.close}>
 *   {modal.data && <UserDetails user={modal.data} />}
 * </Modal>
 */
export function useModal<T = any>() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((modalData?: T) => {
    if (modalData !== undefined) {
      setData(modalData);
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Clear data after a short delay to allow for exit animations
    setTimeout(() => setData(null), 300);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    data,
    open,
    close,
    toggle
  };
}
