/**
 * Renders an audit row's `changes[]` as readable `Field: old → new` lines.
 * Shared by the audit timeline page and the per-entity history panel.
 */

import { useI18n } from '../../i18n';
import type { AuditChange } from '../../types';
import { humanizeField, formatAuditValue } from '../../utils/auditFormat';
import type { SupportedLanguage } from '../../utils/multilingual';

interface AuditChangesProps {
  changes: AuditChange[];
  /** Optional fallback shown when there are no field-level changes (e.g. create/delete). */
  reason?: string | null;
}

/**
 * Render a reason string with minimal `**bold**` markup — used to emphasise the
 * monetary amount in summaries (e.g. "… (total **100 LBP**)"). Segments between
 * `**` pairs render bold; everything else is plain text.
 */
function renderReason(text: string) {
  return text.split('**').map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-gray-700">{part}</strong>
      : <span key={i}>{part}</span>
  );
}

export function AuditChanges({ changes, reason }: AuditChangesProps) {
  const { t, language } = useI18n();
  const lang = language as SupportedLanguage;
  const emptyValue = t('auditLog.emptyValue');

  if (!changes || changes.length === 0) {
    return reason ? <span className="text-gray-500">{renderReason(reason)}</span> : <span className="text-gray-400">—</span>;
  }

  return (
    <ul className="space-y-1">
      {changes.map((c, i) => {
        const oldStr = formatAuditValue(c.old, lang) ?? emptyValue;
        const newStr = formatAuditValue(c.new, lang) ?? emptyValue;
        return (
          <li key={`${c.field}-${i}`} className="text-sm">
            <span className="font-medium text-gray-700">{humanizeField(c.field)}: </span>
            <span className="text-red-600 line-through">{oldStr}</span>
            <span className="mx-1 text-gray-400">→</span>
            <span className="text-green-700">{newStr}</span>
          </li>
        );
      })}
    </ul>
  );
}
