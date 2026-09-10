import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspect() {
  const ids = [
    'db8a1600-2a7b-419a-b27d-628781d3e24c',
    '3cba5495-225c-4af5-83ea-0bc965bfa62a'
  ];

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .in('id', ids);

  console.log('--- PROJECTS DETAILS ---');
  for (const p of projects || []) {
    console.log(JSON.stringify(p, null, 2));
  }

  // Find all tables that have project_id or relate to projects
  const tables = [
    'site_inspections',
    'site_visits',
    'project_participants',
    'documents',
    'project_documents',
    'letters',
    'project_letters',
    'project_stages',
    'stages',
    'project_milestones',
    'milestones',
    'tasks',
    'project_tasks',
    'daily_logs',
    'snag_items',
    'snag_lists',
    'payment_certificates',
    'variations',
    'activity_logs'
  ];

  for (const id of ids) {
    console.log(`\n======================================================`);
    console.log(`DATA FOR PROJECT ID: ${id}`);
    console.log(`======================================================`);

    for (const t of tables) {
      try {
        const { data, count, error: tErr } = await supabase
          .from(t)
          .select('*', { count: 'exact' })
          .eq('project_id', id);

        if (!tErr && (count > 0 || (data && data.length > 0))) {
          console.log(`[${t}]: ${count ?? data.length} records`);
          console.log(JSON.stringify(data, null, 2));
        } else if (!tErr) {
          console.log(`[${t}]: 0 records`);
        }
      } catch (e) {
        // table might not exist
      }
    }
  }
}

inspect().catch(console.error);
