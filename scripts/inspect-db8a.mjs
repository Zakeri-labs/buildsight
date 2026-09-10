import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('project_id', 'db8a1600-2a7b-419a-b27d-628781d3e24c')
    .order('created_at', { ascending: true });

  console.log('AUDIT LOGS FOR db8a1600-2a7b-419a-b27d-628781d3e24c:');
  for (const log of logs || []) {
    console.log(`[${log.created_at}] Action: ${log.action} | Entity: ${log.entity_type} | Details:`, JSON.stringify(log.details));
  }
}
run().catch(console.error);
