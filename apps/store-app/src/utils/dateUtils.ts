/**
 * Date utility functions for consistent date handling
 */

/**
 * Extract local date (YYYY-MM-DD) from an ISO timestamp string
 * This ensures posted_date uses the local date, not UTC date
 * 
 * @param isoString - ISO timestamp string (e.g., "2025-12-28T00:28:13.000Z")
 * @returns Local date string in YYYY-MM-DD format
 * 
 * @example
 * getLocalDateString("2025-12-28T00:28:13.000Z") // Returns "2025-12-28" (or "2025-12-27" if timezone is ahead of UTC)
 */
export function getLocalDateString(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Local calendar "today" as YYYY-MM-DD (device / browser timezone).
 * Use instead of `new Date().toISOString().split('T')[0]` (UTC day).
 */
export function getTodayLocalDate(): string {
  return getLocalDateString(new Date().toISOString());
}

/**
 * After Supabase sync, `bills.bill_date` often arrives as a Postgres `date` (`YYYY-MM-DD`) or as
 * UTC midnight. `new Date('YYYY-MM-DD')` is interpreted as UTC midnight, which displays as a
 * wrong wall-clock time (e.g. 2:00 AM in UTC+2). Combine the calendar day from `bill_date` with
 * the local time-of-day from `created_at` so IndexedDB matches the pre-sync full ISO behavior.
 */
export function normalizeBillDateFromRemote(bill: {
  bill_date?: string | null;
  created_at?: string | null;
}): string {
  const bdRaw = bill.bill_date;
  const caRaw = bill.created_at;

  if (bdRaw == null || bdRaw === '') {
    if (caRaw) {
      const t = new Date(caRaw);
      if (!Number.isNaN(t.getTime())) return t.toISOString();
    }
    return new Date().toISOString();
  }

  const bdStr = String(bdRaw).trim();
  const created = caRaw ? new Date(caRaw) : null;
  const hasValidCreated = created !== null && !Number.isNaN(created.getTime());

  if (/^\d{4}-\d{2}-\d{2}$/.test(bdStr)) {
    if (hasValidCreated) {
      const [y, m, d] = bdStr.split('-').map(Number);
      return new Date(
        y,
        m - 1,
        d,
        created!.getHours(),
        created!.getMinutes(),
        created!.getSeconds(),
        created!.getMilliseconds()
      ).toISOString();
    }
    const [y, m, d] = bdStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }

  const asDate = new Date(bdStr);
  if (Number.isNaN(asDate.getTime())) {
    return bdStr;
  }

  if (hasValidCreated) {
    const utcMidnight =
      asDate.getUTCHours() === 0 &&
      asDate.getUTCMinutes() === 0 &&
      asDate.getUTCSeconds() === 0 &&
      asDate.getUTCMilliseconds() === 0;

    if (utcMidnight) {
      const billDay = getLocalDateString(bdStr);
      const createdDay = getLocalDateString(caRaw!);
      if (billDay === createdDay) {
        const [y, m, d] = billDay.split('-').map(Number);
        return new Date(
          y,
          m - 1,
          d,
          created!.getHours(),
          created!.getMinutes(),
          created!.getSeconds(),
          created!.getMilliseconds()
        ).toISOString();
      }
    }
  }

  return bdStr;
}

