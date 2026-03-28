/**
 * Public Customer Statement Service
 *
 * Single place for all Supabase access for the public customer statement page.
 * UI must not import supabase; this service is the only caller for that feature.
 *
 * Token validation is now server-enforced via the get_customer_by_token RPC
 * which rejects expired tokens at the database level (see migration
 * add_expires_at_to_public_access_tokens.sql).
 *
 * Contract: specs/007-error-handling-validation/contracts/error-handling-contract.md §5
 */

import { supabase } from '../lib/supabase';
import type { Customer } from '../types';
import { makeAppError } from './businessValidationService';
import type { AppError } from '../types/errors';

export interface PublicStatementCustomerResult {
  customer: Customer;
  customerId: string;
  storeId: string;
}

/**
 * Result union for getCustomerByToken.
 *
 * Callers MUST check `success` before accessing `data`.
 */
export type TokenResult =
  | { success: true; data: PublicStatementCustomerResult }
  | { success: false; error: AppError };

/**
 * Validates the public access token server-side and returns customer data.
 *
 * Returns a typed TokenResult — never throws, never calls console.error.
 * The RPC rejects expired tokens at the database level, so a NULL result
 * means either an invalid token or an expired one. When we can distinguish
 * the two (via the RPC returning a specific error code) we surface the
 * correct AppErrorCode; otherwise we default to STATEMENT_TOKEN_INVALID.
 */
export async function getCustomerByToken(
  token: string,
): Promise<TokenResult> {
  if (!token || token.trim().length === 0) {
    return { success: false, error: makeAppError('STATEMENT_TOKEN_INVALID') };
  }

  const { data: customerData, error: rpcError } = await supabase.rpc(
    'get_customer_by_token',
    { p_token: token },
  );

  if (rpcError) {
    return { success: false, error: makeAppError('STATEMENT_TOKEN_INVALID', rpcError) };
  }

  if (!customerData || customerData.length === 0) {
    // The RPC returns nothing for both invalid AND expired tokens.
    // We surface STATEMENT_TOKEN_EXPIRED as the more common actionable case.
    // If the caller needs to distinguish, they could check the token's
    // expires_at directly — but that would be client-side filtering which
    // we deliberately avoid. Default to expired since that's the most
    // actionable message for users with old QR codes.
    return { success: false, error: makeAppError('STATEMENT_TOKEN_EXPIRED') };
  }

  const customerRecord = customerData[0];

  // Log the access (update access count and timestamp)
  await (supabase as any)
    .from('public_access_tokens')
    .update({
      accessed_at: new Date().toISOString(),
      access_count: 1,
    })
    .eq('token', token);

  const customer: Customer = {
    id: customerRecord.id,
    name: customerRecord.name,
    email: customerRecord.email || undefined,
    phone: customerRecord.phone || '',
    address: customerRecord.address || undefined,
    is_active: customerRecord.is_active ?? true,
    created_at: customerRecord.created_at,
    lb_balance: 0,
    usd_balance: 0,
  };

  return {
    success: true,
    data: {
      customer,
      customerId: customerRecord.id,
      storeId: customerRecord.store_id || '',
    },
  };
}
