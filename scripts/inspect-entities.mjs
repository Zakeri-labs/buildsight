import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectEntities() {
  const ids = [
    'db8a1600-2a7b-419a-b27d-628781d3e24c',
    '3cba5495-225c-4af5-83ea-0bc965bfa62a'
  ];

  // Check site_visit_requests
  for (const tableName of ['site_visit_requests', 'term_responses', 'translation_documents', 'project_initial_documents', 'letters', 'initial_documents']) {
    for (const id of ids) {
      try {
        const { data, count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .eq('project_id', id);
        if (!error && (count > 0 || (data && data.length > 0))) {
          console.log(`[${tableName}] for ${id}: ${count ?? data?.length} records`);
          for (const row of data || []) {
            console.log(`   - ID: ${row.id} | created_at: ${row.created_at || row.date} | details:`, JSON.stringify(row).slice(0, 200));
          }
        }
      } catch (e) {}
    }
  }
}
inspectEntities().catch(console.error);
