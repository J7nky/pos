import { ParitySupabaseState, createSupabaseFromState } from './paritySupabaseMock';

/** Single shared mock state for the parity suite (vi.mock factory must not depend on test file import order). */
export const parityMockState = new ParitySupabaseState();
export const paritySupabase = createSupabaseFromState(parityMockState).supabase;
