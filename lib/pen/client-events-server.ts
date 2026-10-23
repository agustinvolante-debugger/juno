import { supabaseAdmin } from '@/lib/supabase'
import type { ClientEventRow } from './client-events'

/**
 * One pen_client_events row (lib/pen/schema.sql, 2026-10-23). Never throws: before the table
 * exists, or if the write fails, it says so once in the log and the request still succeeds.
 */
export async function storeClientEvent(row: ClientEventRow): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from('pen_client_events').insert(row)
    if (!error) return true
    console.warn(`pen: pen_client_events not written (run the 2026-10-23 CREATE in lib/pen/schema.sql?): ${error.message}`)
  } catch (e) {
    console.warn(`pen: pen_client_events not written: ${(e as Error).message}`)
  }
  return false
}
