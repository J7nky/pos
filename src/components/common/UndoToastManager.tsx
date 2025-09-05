import React, { useState, useEffect, useCallback } from 'react';
import Toast from './Toast';
import { useOfflineData } from '../../contexts/OfflineDataContext';

const UndoToastManager: React.FC = () => {
  const { canUndo, undoLastAction } = useOfflineData();
  const [visible, setVisible] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Show the toast when canUndo becomes true
  useEffect(() => {
    if (canUndo) setVisible(true);
  }, [canUndo]);

  // Hide feedback after a short delay
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    const result = await undoLastAction();
    setUndoing(false);
    setVisible(false);
    setFeedback(result ? 'Action undone!' : 'Undo failed.');
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