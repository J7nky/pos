// =========================================================================
//  Edge Function: admin-users
//
//  Server-side home for every operation that previously used the service
//  role key from the client bundles (P0-1 security fix). The service role
//  key must NEVER ship in a VITE_* var — it bypasses all RLS.
//
//  Invocation:
//    POST /functions/v1/admin-users
//    Authorization: Bearer <caller's user JWT>
//    body: { action: 'check_email' | 'create_user' | 'delete_auth_user'
//                   | 'reset_password', ...params }
//
//  Authorization model (enforced here, not in the client):
//    - super_admin (users.role='super_admin'): any store.
//    - store 'admin' / 'manager': only within their own store_id, and the
//      target user's role may never be 'super_admin'.
//    - everyone else: rejected.
//
//  Actions:
//    check_email      { email } -> { exists }
//    create_user      { email, password, name, role, store_id, branch_id?,
//                       phone?, address?, monthly_salary?, salary_currency?,
//                       working_hours_start?, working_hours_end?,
//                       working_days? }
//                     -> { user, entity_created }
//                     Creates the auth user (email confirmed), the users
//                     row, and a matching employee entity row. Rolls the
//                     auth user back if the users insert fails.
//    delete_auth_user { user_id } -> { deleted }
//                     Deletes ONLY the auth user. If the target still has a
//                     users row it must be in the caller's store; an
//                     orphaned auth user (no users row — failed-create
//                     rollback) may be deleted by any authorized caller.
//    reset_password   { user_id, new_password } -> { reset }
// =========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(
  req: Request,
  body: unknown,
  init: { status?: number } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...corsHeadersFor(req) },
  });
}

interface CallerProfile {
  id: string;
  store_id: string | null;
  role: string;
  is_active?: boolean | null;
}

const MANAGING_ROLES = new Set(['admin', 'manager']);
const ASSIGNABLE_ROLES = new Set(['admin', 'manager', 'cashier']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, { status: 405 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // --- Identify the caller from their JWT -------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return jsonResponse(req, { error: 'Missing Authorization header' }, { status: 401 });
  }
  const { data: authUser, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !authUser?.user) {
    return jsonResponse(req, { error: 'Invalid or expired token' }, { status: 401 });
  }

  const { data: caller, error: callerErr } = await admin
    .from('users')
    .select('id, store_id, role, is_active')
    .eq('id', authUser.user.id)
    .maybeSingle();
  if (callerErr || !caller) {
    return jsonResponse(req, { error: 'Caller has no user profile' }, { status: 403 });
  }
  const profile = caller as CallerProfile;
  if (profile.is_active === false) {
    return jsonResponse(req, { error: 'Caller is deactivated' }, { status: 403 });
  }

  const isSuperAdmin = profile.role === 'super_admin';
  const isStoreManager = MANAGING_ROLES.has(profile.role) && !!profile.store_id;
  if (!isSuperAdmin && !isStoreManager) {
    return jsonResponse(req, { error: 'Not authorized to manage users' }, { status: 403 });
  }

  /** Store-scoped callers may only act inside their own store. */
  function canActOnStore(storeId: string | null | undefined): boolean {
    if (isSuperAdmin) return true;
    return !!storeId && storeId === profile.store_id;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = String(body.action ?? '');

  try {
    // ------------------------------------------------------------------
    if (action === 'check_email') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!email) return jsonResponse(req, { error: 'email is required' }, { status: 400 });
      const { data, error } = await admin
        .from('users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (error) throw error;
      return jsonResponse(req, { exists: !!data });
    }

    // ------------------------------------------------------------------
    if (action === 'create_user') {
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim();
      const role = String(body.role ?? '');
      const storeId = body.store_id ? String(body.store_id) : null;

      if (!email || !password || !name || !role || !storeId) {
        return jsonResponse(
          req,
          { error: 'email, password, name, role and store_id are required' },
          { status: 400 },
        );
      }
      if (!ASSIGNABLE_ROLES.has(role)) {
        return jsonResponse(req, { error: `Role '${role}' cannot be assigned` }, { status: 400 });
      }
      if (!canActOnStore(storeId)) {
        return jsonResponse(req, { error: 'Not authorized for this store' }, { status: 403 });
      }

      // Global email uniqueness (the client's own RLS view is store-scoped
      // and cannot see users of other stores).
      const { data: existing, error: existErr } = await admin
        .from('users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (existErr) throw existErr;
      if (existing) {
        return jsonResponse(req, { error: 'A user with this email already exists' }, { status: 409 });
      }

      const { data: authData, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !authData?.user) {
        return jsonResponse(
          req,
          { error: `Failed to create user account: ${createErr?.message ?? 'no user returned'}` },
          { status: 400 },
        );
      }

      const userData = {
        id: authData.user.id,
        store_id: storeId,
        branch_id: (body.branch_id as string | null) ?? null,
        email,
        name,
        role,
        phone: (body.phone as string | null) ?? null,
        address: (body.address as string | null) ?? null,
        monthly_salary: (body.monthly_salary as string | null) ?? null,
        salary_currency: (body.salary_currency as string | null) ?? null,
        working_hours_start: (body.working_hours_start as string | null) ?? null,
        working_hours_end: (body.working_hours_end as string | null) ?? null,
        working_days: (body.working_days as unknown) ?? null,
        is_active: true,
      };

      const { data: userRow, error: userErr } = await admin
        .from('users')
        .insert(userData)
        .select()
        .single();
      if (userErr) {
        // Roll back the auth user so a retry isn't blocked by a half-created account.
        await admin.auth.admin.deleteUser(authData.user.id);
        return jsonResponse(
          req,
          { error: `Failed to create user: ${userErr.message}` },
          { status: 400 },
        );
      }

      // Matching employee entity (same id). Best-effort, like the previous
      // client behavior — a failure here does not fail the whole creation.
      const now = new Date().toISOString();
      let entityCreated = false;
      const { error: entityErr } = await admin.from('entities').insert({
        id: authData.user.id,
        store_id: storeId,
        branch_id: (body.branch_id as string | null) ?? null,
        entity_type: 'employee',
        entity_code: `EMP-${authData.user.id.slice(0, 8).toUpperCase()}`,
        name,
        phone: (body.phone as string | null) ?? null,
        is_system_entity: false,
        is_active: true,
        customer_data: null,
        supplier_data: null,
        created_at: now,
        updated_at: now,
      });
      if (entityErr) {
        console.error('admin-users: entity insert failed (non-fatal):', entityErr.message);
      } else {
        entityCreated = true;
      }

      return jsonResponse(req, { user: userRow, entity_created: entityCreated });
    }

    // ------------------------------------------------------------------
    if (action === 'delete_auth_user') {
      const userId = String(body.user_id ?? '');
      if (!userId) return jsonResponse(req, { error: 'user_id is required' }, { status: 400 });

      const { data: target, error: targetErr } = await admin
        .from('users')
        .select('id, store_id, role')
        .eq('id', userId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      // A users row still exists -> normal delete, must be authorized for
      // its store and must never target a super_admin. No users row ->
      // orphaned auth account from a failed create; any authorized caller
      // may clean it up.
      if (target) {
        if (target.role === 'super_admin' && !isSuperAdmin) {
          return jsonResponse(req, { error: 'Cannot delete a super admin' }, { status: 403 });
        }
        if (!canActOnStore(target.store_id)) {
          return jsonResponse(req, { error: 'Not authorized for this store' }, { status: 403 });
        }
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        return jsonResponse(req, { error: `Failed to delete auth user: ${delErr.message}` }, { status: 400 });
      }
      return jsonResponse(req, { deleted: true });
    }

    // ------------------------------------------------------------------
    if (action === 'reset_password') {
      const userId = String(body.user_id ?? '');
      const newPassword = String(body.new_password ?? '');
      if (!userId || !newPassword) {
        return jsonResponse(req, { error: 'user_id and new_password are required' }, { status: 400 });
      }

      const { data: target, error: targetErr } = await admin
        .from('users')
        .select('id, store_id, role')
        .eq('id', userId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) {
        return jsonResponse(req, { error: 'User not found' }, { status: 404 });
      }
      if (target.role === 'super_admin' && !isSuperAdmin) {
        return jsonResponse(req, { error: 'Cannot reset a super admin password' }, { status: 403 });
      }
      if (!canActOnStore(target.store_id)) {
        return jsonResponse(req, { error: 'Not authorized for this store' }, { status: 403 });
      }

      const { error: resetErr } = await admin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (resetErr) {
        return jsonResponse(req, { error: `Failed to reset password: ${resetErr.message}` }, { status: 400 });
      }
      return jsonResponse(req, { reset: true });
    }

    return jsonResponse(req, { error: `Unknown action '${action}'` }, { status: 400 });
  } catch (err) {
    console.error('admin-users error:', err);
    return jsonResponse(
      req,
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
});
