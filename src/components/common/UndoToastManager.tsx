import React, { useState, useEffect, useCallback, useRef } from 'react';
import Toast from './Toast';
import { useOfflineData } from '../../contexts/OfflineDataContext';

const UndoToastManager: React.FC = () => {
  const { canUndo, undoLastAction } = useOfflineData();
  const [visible, setVisible] = useState(false); 
  const [undoing, setUndoing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [progress, setProgress] = useState(100);
  const previousCanUndo = useRef(canUndo);
  const lastUndoTimestamp = useRef<number>(0);
  const autoHideTimer = useRef<NodeJS.Timeout | null>(null);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  // Track when canUndo changes and check for new undo actions
  useEffect(() => {
    
    // Don't trigger if we're just showing feedback
    if (feedback) return;
    
    if (canUndo) {
      // Check if this is a new undo action by checking timestamp
      const undoData = localStorage.getItem('last_undo_action');
      if (undoData) {
        try {
          const parsed = JSON.parse(undoData);
          const currentTimestamp = parsed.timestamp || 0;
          
          // If this is a new action (different timestamp) or first action
          if (currentTimestamp !== lastUndoTimestamp.current) {
            lastUndoTimestamp.current = currentTimestamp;
            setVisible(true);
            setProgress(100);

            // Clear any existing timers
            if (autoHideTimer.current) {
              clearTimeout(autoHideTimer.current);
            }
            if (progressTimer.current) {
              clearInterval(progressTimer.current);
            }

            // Start progress countdown (8 seconds total)
            const startTime = Date.now();
            const duration = 8000; // 8 seconds
            const updateInterval = 50; // Update every 50ms for smooth animation

            progressTimer.current = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const remaining = Math.max(0, duration - elapsed);
              const progressPercent = (remaining / duration) * 100;
              
              setProgress(progressPercent);
              
              if (remaining <= 0) {
                setVisible(false);
                if (progressTimer.current) {
                  clearInterval(progressTimer.current);
                  progressTimer.current = null;
                }
              }
            }, updateInterval);

            // Auto-hide after 8 seconds if not interacted with
            autoHideTimer.current = setTimeout(() => {
              setVisible(false);
              if (progressTimer.current) {
                clearInterval(progressTimer.current);
                progressTimer.current = null;
              }
            }, 8000);
          }
        } catch (error) {
          console.error('Error parsing undo data:', error);
        }
      }
    } else if (!canUndo) {
      // No undo available, hide toast
      setVisible(false);
      setProgress(100);
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
        autoHideTimer.current = null;
      }
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }

    previousCanUndo.current = canUndo;
  }, [canUndo, visible, feedback]);


  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
      }
    };
  }, []);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    const result = await undoLastAction();
    setUndoing(false);
    
    // Clear all existing timers and hide current toast
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    
    // Hide current toast and show feedback toast
    setVisible(false);
    setFeedback(result ? 'Action undone!' : 'Undo failed.');
    
    // Show feedback toast for 2 seconds
    setTimeout(() => {
      setFeedback(null);
    }, 2000);
  }, [undoLastAction]);

  // Determine what to show in the single toast
  const getToastMessage = () => {
    if (feedback) return feedback;
    if (undoing) return 'Undoing...';
    return 'Action completed';
  };

  const getToastType = () => {
    if (feedback) return feedback === 'Action undone!' ? 'success' : 'error';
    return 'success';
  };

  const showActionButton = () => {
    return !feedback && !undoing;
  };

  return (
    <Toast
      message={getToastMessage()}
      type={getToastType()}
      visible={visible}
      onClose={() => {
        setVisible(false);
        setFeedback(null);
      }}
      onAction={showActionButton() ? handleUndo : undefined}
      actionLabel={showActionButton() ? 'Undo' : undefined}
      progress={showActionButton() ? progress : undefined}
    />
  );
};

export default UndoToastManager;
