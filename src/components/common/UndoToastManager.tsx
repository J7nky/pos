import React, { useState, useEffect, useCallback, useRef } from 'react';
import Toast from './Toast';
import { useOfflineData } from '../../contexts/OfflineDataContext';

const UndoToastManager: React.FC = () => {
  const { canUndo, undoLastAction } = useOfflineData();
  const [visible, setVisible] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const previousCanUndo = useRef(canUndo);
  const autoHideTimer = useRef<NodeJS.Timeout | null>(null);

  // Track when canUndo changes from false to true (new action performed)
  useEffect(() => {
    console.log('🔔 UndoToastManager: canUndo changed to', canUndo, 'previous was', previousCanUndo.current);

    if (canUndo && !previousCanUndo.current) {
      // New action just became available
      console.log('🔔 UndoToastManager: Showing undo toast');
      setVisible(true);

      // Auto-hide after 8 seconds if not interacted with
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
      autoHideTimer.current = setTimeout(() => {
        console.log('🔔 UndoToastManager: Auto-hiding toast after 8 seconds');
        setVisible(false);
      }, 8000);
    } else if (!canUndo) {
      // No undo available, hide toast
      console.log('🔔 UndoToastManager: Hiding toast - no undo available');
      setVisible(false);
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
        autoHideTimer.current = null;
      }
    }

    previousCanUndo.current = canUndo;
  }, [canUndo]);

  // Hide feedback after a short delay
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
    };
  }, []);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    const result = await undoLastAction();
    setUndoing(false);
    setVisible(false);
    setFeedback(result ? 'Action undone!' : 'Undo failed.');
    
    // Clear auto-hide timer since user interacted
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
  }, [undoLastAction]);

  return (
    <>
      <Toast
        message={undoing ? 'Undoing...' : 'Action completed'}
        type={undoing ? 'success' : 'success'}
        visible={visible && !undoing}
        onClose={() => setVisible(false)}
        onAction={handleUndo}
        actionLabel="Undo"
      />
      <Toast
        message={feedback || ''}
        type={feedback === 'Action undone!' ? 'success' : 'error'}
        visible={!!feedback}
        onClose={() => setFeedback(null)}
      />
    </>
  );
};

export default UndoToastManager;
