import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectAll() {
  const ids = [
    'db8a1600-2a7b-419a-b27d-628781d3e24c',
    '3cba5495-225c-4af5-83ea-0bc965bfa62a'
  ];

  const potentialTables = [
    'site_inspections',
    'site_visits',
    'inspection_requests',
    'site_inspection_items',
    'project_participants',
    'documents',
    'project_documents',
    'project_files',
    'letters',
    'project_letters',
    'correspondence',
    'project_stages',
    'stages',
    'tasks',
    'project_tasks',
    'daily_logs',
    'snag_items',
    'snag_lists',
    'payment_certificates',
    'variations',
    'activity_logs',
    'audit_logs',
    'project_notes',
    'site_reports',
    'site_photos',
    'contractor_invoices',
    'client_invoices'
  ];

  for (const id of ids) {
    console.log(`\n======================================================`);
    console.log(`CHECKING ALL TABLES FOR PROJECT: ${id}`);
    console.log(`======================================================`);

    for (const t of potentialTables) {
      try {
        const { data, count, error } = await supabase
          .from(t)
          .select('*', { count: 'exact' })
          .eq('project_id', id);

        if (!error && (count > 0 || (data && data.length > 0))) {
          console.log(`✅ Table [${t}]: ${count ?? data?.length} records found`);
          for (const item of (data || [])) {
            console.log(`   - ID: ${item.id} | created_at: ${item.created_at || item.date || item.visit_date} | title/name/status: ${item.title || item.name || item.subject || item.status || ''}`);
          }
        }
      } catch (e) {}
    }
  }

  // Let's also check site_inspections where project_id might be mapped or check any inspection with project code or client
  try {
    const { data: allInspections, error: inspErr } = await supabase
      .from('site_inspections')
      .select('id, project_id, inspection_date, status, stage_id, created_at, created_by')
      .in('project_id', ids);

    console.log('\n--- SITE INSPECTIONS FOR THESE PROJECTS ---');
    console.log(JSON.stringify(allInspections, null, 2));
  } catch (e) {}

  // Let's check user/creator details
  try {
    const { data: creator } = await supabase
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', '2aee587a-ead6-4ab1-af35-6696c1228d1c');
    console.log('\n--- CREATOR DETAILS ---', JSON.stringify(creator, null, 2));
  } catch (e) {}

  // Check clients
  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .or(`name.ilike.%Abdul Rahman%,id.in.(82d06874-202e-4009-bca0-4aa9cc61d281,0010b0a7-5f83-4709-9013-34a249120dc9)`);
    console.log('\n--- MATCHING CLIENTS ---', JSON.stringify(clients, null, 2));
  } catch (e) {}
}

inspectAll().catch(console.error);
