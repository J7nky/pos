# Database Storage Impact Analysis
## Increasing NUMERIC Precision from (10,2) to (15,2)

### Summary
**Minimal to zero impact on existing data storage size.**

### How PostgreSQL Stores NUMERIC Type

PostgreSQL's `NUMERIC` type uses **variable-length storage**, meaning:
- Storage size depends on the **actual number of digits** in the value, NOT the declared precision
- Changing precision from `numeric(10,2)` to `numeric(15,2)` does NOT increase storage for existing values
- The precision declaration only sets a **validation limit** on what can be inserted

### Storage Calculation Formula

For each NUMERIC value:
```
Storage = 6 bytes (header) + (number_of_digits / 4) * 2 bytes
```

**Examples:**

| Value | Digits | Header | Digit Storage | Total per Value |
|-------|--------|--------|---------------|----------------|
| `123.45` | 5 | 6 bytes | 4 bytes (1 group) | **10 bytes** |
| `99999999.99` | 10 | 6 bytes | 6 bytes (3 groups) | **12 bytes** |
| `100000000000` | 12 | 6 bytes | 6 bytes (3 groups) | **12 bytes** |

*Note: PostgreSQL stores digits in base-10,000 (4 digits per group)*

### Impact Analysis

#### For Existing Data:
- ✅ **ZERO storage increase** - Existing values stored with same number of digits use same storage
- ✅ **No data migration overhead** - PostgreSQL only updates metadata, not actual data

#### For New Data:
- ✅ Same storage as before if values have same number of digits
- ✅ Can now store larger values (up to 100 billion vs 99 million)

### Tables Being Updated

**Primary Tables (Fixed ALTER):**
1. **bills**: 4 columns (subtotal, total_amount, amount_paid, amount_due)
2. **bill_line_items**: 3 columns (unit_price, line_total, weight)

**Conditional Tables (Only if they exist):**
3. transactions: amount (if exists)
4. customers: lb_balance, usd_balance (if exists)
5. suppliers: lb_balance, usd_balance (if exists)
6. cash_drawer_accounts: current_balance, opening_balance (if exists)
7. inventory_items: price, selling_price (if exists)

### Storage Size Example

Assuming you have:
- **10,000 bills** with 4 numeric fields
- **50,000 bill_line_items** with 3 numeric fields
- Average value: 5 digits (e.g., `12345.67`)

**Before migration:**
- Bills: 10,000 rows × 4 fields × 10 bytes = 400 KB
- Line items: 50,000 rows × 3 fields × 10 bytes = 1.5 MB
- **Total: ~1.9 MB**

**After migration:**
- Bills: 10,000 rows × 4 fields × 10 bytes = 400 KB (same!)
- Line items: 50,000 rows × 3 fields × 10 bytes = 1.5 MB (same!)
- **Total: ~1.9 MB** (no change!)

### Real-World Impact

**Small database (< 100K records):**
- Impact: Negligible (< 1 MB)
- Migration time: < 1 second

**Medium database (100K - 1M records):**
- Impact: Negligible (< 10 MB)
- Migration time: < 5 seconds

**Large database (> 1M records):**
- Impact: Minimal (< 100 MB additional only if storing very large values)
- Migration time: 5-30 seconds (depending on table size)

### Migration Process Impact

The `ALTER TABLE ... ALTER COLUMN TYPE` operation:
1. ✅ Updates metadata (catalog) - Instant
2. ✅ Does NOT rewrite existing data values
3. ✅ Only affects future inserts/updates validation
4. ⚠️ May require ACCESS EXCLUSIVE lock briefly (seconds)

### Performance Impact

- ✅ **No performance degradation** for queries on existing data
- ✅ Indexes remain unchanged (same storage)
- ✅ Storage calculation unchanged for same values
- ✅ Arithmetic operations same speed

### Recommendations

1. **Backup before migration** (standard practice)
2. **Run during low-traffic period** (lock requirement)
3. **Monitor disk space** during migration (minimal but good practice)
4. **Test on staging first** if possible

### Conclusion

**This migration has minimal to zero impact on database size** because:
- PostgreSQL NUMERIC is variable-length based on actual digits
- Precision change only affects validation limits
- Existing data storage remains unchanged
- New large values (if stored) will use more space, but that's expected

**Estimated impact: < 0.1% of total database size** for typical POS system data.

---

*For questions or concerns, refer to PostgreSQL documentation on NUMERIC type storage.*

