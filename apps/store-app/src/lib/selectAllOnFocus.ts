/**
 * Global "select all on focus" behaviour.
 *
 * When a user focuses a text-like field — by clicking it or tabbing into it —
 * its whole value is selected, so typing replaces it instead of appending.
 * This is the fast path for re-entering quantities, prices and codes on a POS.
 *
 * Installed once from `main.tsx`, so it applies to every input in the app
 * without touching individual components.
 *
 * Per-field opt-out / opt-in via a data attribute:
 *   <input data-select-all="false" />     never auto-selects
 *   <textarea data-select-all="true" />   auto-selects (textareas are off by default)
 *
 * Clicking a field that is *already* focused behaves normally (caret placement),
 * and click-dragging to select part of the value is preserved.
 */

/** Input types where selecting the value is meaningful. */
const SELECTABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'number',
]);

/** Movement (px) beyond which a press is treated as a drag-select, not a click. */
const DRAG_THRESHOLD_PX = 4;

type SelectableField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Set on a field while its value is fully selected by this module and untouched.
 * Read by NativeKeyboardHandler so the on-screen numpad replaces the value
 * instead of appending to it (number inputs expose no selection API).
 */
export const SELECT_ALL_ATTR = 'data-select-all-active';

function isSelectableField(target: EventTarget | null): target is SelectableField {
  if (!(target instanceof HTMLElement)) return false;

  const optOut = target.getAttribute('data-select-all');
  if (optOut === 'false') return false;

  if (target instanceof HTMLTextAreaElement) {
    // Long-form text is opt-in — selecting a whole note risks wiping it.
    return optOut === 'true' && !target.disabled && !target.readOnly;
  }

  if (!(target instanceof HTMLInputElement)) return false;
  if (target.disabled) return false;

  return SELECTABLE_INPUT_TYPES.has((target.type || 'text').toLowerCase());
}

function selectAll(field: SelectableField): void {
  if (field.value === '') return;
  try {
    field.select();
    field.setAttribute(SELECT_ALL_ATTR, 'true');
  } catch {
    // Some input types don't support programmatic selection — ignore.
  }
}

function clearSelectAllFlag(target: EventTarget | null): void {
  if (target instanceof HTMLElement && target.hasAttribute(SELECT_ALL_ATTR)) {
    target.removeAttribute(SELECT_ALL_ATTR);
  }
}

export function installSelectAllOnFocus(): () => void {
  // Field the user pressed on while it was unfocused; the pending click should
  // keep the whole value selected rather than collapsing to a caret.
  let armedField: SelectableField | null = null;
  let armedX = 0;
  let armedY = 0;

  const handlePointerDown = (event: PointerEvent) => {
    armedField = null;
    const target = event.target;
    if (!isSelectableField(target)) return;
    // Already focused: let the user place the caret normally.
    if (document.activeElement === target) return;

    armedField = target;
    armedX = event.clientX;
    armedY = event.clientY;
  };

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!isSelectableField(target)) return;

    selectAll(target);

    // Keyboard / programmatic focus: some fields fill themselves in on focus
    // (MoneyInput's auto-complete), so re-select once React has rendered.
    // Pointer focus is handled by handleMouseUp instead.
    if (armedField !== target) {
      requestAnimationFrame(() => {
        if (document.activeElement === target) selectAll(target);
      });
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    const field = armedField;
    armedField = null;
    if (!field || document.activeElement !== field) return;

    // A drag means the user selected a specific range — leave it alone.
    if (
      Math.abs(event.clientX - armedX) > DRAG_THRESHOLD_PX ||
      Math.abs(event.clientY - armedY) > DRAG_THRESHOLD_PX
    ) {
      return;
    }

    // Prevents the browser from collapsing the selection to the click point.
    event.preventDefault();
    selectAll(field);
  };

  const handleInput = (event: Event) => clearSelectAllFlag(event.target);
  const handleFocusOut = (event: FocusEvent) => clearSelectAllFlag(event.target);
  const handleKeyDown = (event: KeyboardEvent) => {
    // Arrow/Home/End move the caret without changing the value.
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      clearSelectAllFlag(event.target);
    }
  };

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('focusout', handleFocusOut, true);
  document.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('focusout', handleFocusOut, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  };
}
