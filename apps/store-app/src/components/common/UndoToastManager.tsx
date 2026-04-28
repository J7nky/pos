import React, { useState, useEffect, useCallback, useRef } from 'react';
import Toast from './Toast';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';
import { UNDO_STORAGE_KEY } from '../../contexts/offlineData/operations/undoOperations';

const UndoToastManager: React.FC = () => {
  const { canUndo, undoLastAction } = useOfflineData();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);
  const [progress, setProgress] = useState(100);
  // Bumped on every pushUndo via the 'undo-pushed' window event so the effect below
  // re-runs even when canUndo stays true across consecutive (still-unsynced) operations.
  const [pushTick, setPushTick] = useState(0);
  const lastUndoTimestamp = useRef<number>(
    (() => {
      if (typeof sessionStorage === 'undefined') return 0;
      try {
        const raw = sessionStorage.getItem(UNDO_STORAGE_KEY);
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        return typeof parsed?.timestamp === 'number' ? parsed.timestamp : 0;
      } catch {
        return 0;
      }
    })()
  );
  const autoHideTimer = useRef<NodeJS.Timeout | null>(null);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);
  const feedbackClearTimer = useRef<NodeJS.Timeout | null>(null);

  // Track when canUndo changes and check for new undo actions
  useEffect(() => {
    // Don't trigger if we're just showing feedback
    if (feedback) return;

    if (canUndo) {
      const undoData =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(UNDO_STORAGE_KEY) : null;
      if (undoData) {
        try {
          const parsed = JSON.parse(undoData);
          const currentTimestamp = parsed.timestamp || 0;

          // If this is a new action (different timestamp) or first action
          if (currentTimestamp !== lastUndoTimestamp.current) {
            lastUndoTimestamp.current = currentTimestamp;
            setActionType(typeof parsed.type === 'string' ? parsed.type : null);
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

  }, [canUndo, feedback, pushTick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setPushTick(t => t + 1);
    window.addEventListener('undo-pushed', handler);
    return () => window.removeEventListener('undo-pushed', handler);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
      }
      if (feedbackClearTimer.current) {
        clearTimeout(feedbackClearTimer.current);
      }
    };
  }, []);

  const handleUndo = useCallback(async () => {
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    if (feedbackClearTimer.current) {
      clearTimeout(feedbackClearTimer.current);
      feedbackClearTimer.current = null;
    }

    setUndoing(true);
    const result = await undoLastAction();
    setUndoing(false);

    setVisible(true);
    setFeedback(result ? t('common.labels.actionUndone') : t('common.labels.actionFailed'));
    setFeedbackType(result ? 'success' : 'error');

    feedbackClearTimer.current = setTimeout(() => {
      setFeedback(null);
      setFeedbackType(null);
      setActionType(null);
      setVisible(false);
      feedbackClearTimer.current = null;
    }, 2000);
  }, [undoLastAction, t]);

  const getToastMessage = () => {
    if (feedback) return feedback;
    if (undoing) return t('common.labels.undoing');
    if (actionType) {
      const key = `common.labels.undoActions.${actionType}`;
      const label = t(key);
      return label === key ? t('common.labels.actionCompleted') : label;
    }
    return t('common.labels.actionCompleted');
  };

  const getToastType = () => feedbackType ?? 'success';

  const showActionButton = () => !feedback && !undoing;

  return (
    <Toast
      message={getToastMessage()}
      type={getToastType()}
      visible={visible}
      onClose={() => {
        setVisible(false);
        setFeedback(null);
        setFeedbackType(null);
        setActionType(null);
      }}
      onAction={showActionButton() ? handleUndo : undefined}
      actionLabel={showActionButton() ? t('common.labels.undo') : undefined}
      progress={showActionButton() ? progress : undefined}
    />
  );
};

export default UndoToastManager;
