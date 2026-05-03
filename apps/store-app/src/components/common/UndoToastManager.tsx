import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Undo2, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';
import { UNDO_STORAGE_KEY } from '../../contexts/offlineData/operations/undoOperations';

const AUTO_HIDE_MS = 8000;
const FEEDBACK_HIDE_MS = 1800;
const PROGRESS_TICK_MS = 80;

const UndoToastManager: React.FC = () => {
  const { canUndo, undoLastAction } = useOfflineData();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);
  const [progress, setProgress] = useState(100);
  const [paused, setPaused] = useState(false);
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
  const startTimeRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const startCountdown = useCallback(() => {
    clearProgressTimer();
    startTimeRef.current = Date.now();
    elapsedBeforePauseRef.current = 0;
    setProgress(100);

    progressTimer.current = setInterval(() => {
      const elapsed = elapsedBeforePauseRef.current + (Date.now() - startTimeRef.current);
      const remaining = Math.max(0, AUTO_HIDE_MS - elapsed);
      setProgress((remaining / AUTO_HIDE_MS) * 100);
      if (remaining <= 0) {
        clearProgressTimer();
        setVisible(false);
      }
    }, PROGRESS_TICK_MS);
  }, []);

  // Track when canUndo changes and check for new undo actions
  useEffect(() => {
    if (feedback) return;

    if (canUndo) {
      const undoData =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(UNDO_STORAGE_KEY) : null;
      if (!undoData) return;
      try {
        const parsed = JSON.parse(undoData);
        const currentTimestamp = parsed.timestamp || 0;
        if (currentTimestamp !== lastUndoTimestamp.current) {
          lastUndoTimestamp.current = currentTimestamp;
          setActionType(typeof parsed.type === 'string' ? parsed.type : null);
          setVisible(true);
          setPaused(false);
          startCountdown();
        }
      } catch (error) {
        console.error('Error parsing undo data:', error);
      }
    } else {
      setVisible(false);
      setProgress(100);
      clearProgressTimer();
    }
  }, [canUndo, feedback, pushTick, startCountdown]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setPushTick(t => t + 1);
    window.addEventListener('undo-pushed', handler);
    return () => window.removeEventListener('undo-pushed', handler);
  }, []);

  // Pause/resume countdown when user hovers or touches the toast.
  // Avoids the frustrating case of the toast disappearing as the finger lands on it.
  useEffect(() => {
    if (feedback || undoing || !visible) return;
    if (paused) {
      // Freeze the timer; remember how much time has already elapsed.
      if (progressTimer.current) {
        elapsedBeforePauseRef.current += Date.now() - startTimeRef.current;
        clearProgressTimer();
      }
    } else if (!progressTimer.current) {
      // Resume from where we left off.
      startTimeRef.current = Date.now();
      progressTimer.current = setInterval(() => {
        const elapsed = elapsedBeforePauseRef.current + (Date.now() - startTimeRef.current);
        const remaining = Math.max(0, AUTO_HIDE_MS - elapsed);
        setProgress((remaining / AUTO_HIDE_MS) * 100);
        if (remaining <= 0) {
          clearProgressTimer();
          setVisible(false);
        }
      }, PROGRESS_TICK_MS);
    }
  }, [paused, feedback, undoing, visible]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearProgressTimer();
      if (feedbackClearTimer.current) clearTimeout(feedbackClearTimer.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    clearProgressTimer();
    setVisible(false);
    setFeedback(null);
    setFeedbackType(null);
    setActionType(null);
    setPaused(false);
  }, []);

  const handleUndo = useCallback(async () => {
    clearProgressTimer();
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
    }, FEEDBACK_HIDE_MS);
  }, [undoLastAction, t]);

  const message = (() => {
    if (feedback) return feedback;
    if (undoing) return t('common.labels.undoing');
    if (actionType) {
      const key = `common.labels.undoActions.${actionType}`;
      const label = t(key);
      return label === key ? t('common.labels.actionCompleted') : label;
    }
    return t('common.labels.actionCompleted');
  })();

  const showActionButton = !feedback && !undoing;
  const isError = feedbackType === 'error';

  if (!visible) return null;

  const Icon = undoing
    ? Loader2
    : isError
      ? AlertCircle
      : CheckCircle2;

  // Outer wrapper is non-interactive — clicks pass through the whitespace
  // around the pill so the toast never blocks page UI.
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pb-4 sm:pb-6"
      aria-live="polite"
      role="status"
    >
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onTouchCancel={() => setPaused(false)}
        className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl shadow-2xl ring-1 transition-all duration-200 motion-safe:animate-[undoToastIn_180ms_ease-out] ${
          isError
            ? 'bg-red-600 text-white ring-red-700/40'
            : 'bg-gray-900 text-white ring-white/10'
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
          <Icon
            className={`h-5 w-5 flex-shrink-0 ${undoing ? 'animate-spin' : ''} ${
              isError ? 'text-white' : feedbackType === 'success' ? 'text-emerald-400' : 'text-emerald-400'
            }`}
            aria-hidden="true"
          />

          <span className="flex-1 truncate text-sm font-medium sm:text-[15px]">
            {message}
          </span>

          {showActionButton && (
            <button
              type="button"
              onClick={handleUndo}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 active:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label={t('common.labels.undo')}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              <span>{t('common.labels.undo')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label={t('common.labels.close') === 'common.labels.close' ? 'Dismiss' : t('common.labels.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {showActionButton && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div
              className="h-full bg-white/60 transition-[width] ease-linear"
              style={{
                width: `${progress}%`,
                transitionDuration: `${PROGRESS_TICK_MS}ms`,
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes undoToastIn {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-[undoToastIn"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default UndoToastManager;
