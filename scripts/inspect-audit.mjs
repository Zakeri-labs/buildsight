import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectAuditAndDetails() {
  const ids = [
    'db8a1600-2a7b-419a-b27d-628781d3e24c',
    '3cba5495-225c-4af5-83ea-0bc965bfa62a'
  ];

  for (const id of ids) {
    console.log(`\n======================================================`);
    console.log(`AUDIT LOGS FOR PROJECT: ${id}`);
    console.log(`======================================================`);

    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true });

    if (logs) {
      for (const log of logs) {
        console.log(`[${log.created_at}] Action: ${log.action || log.event} | Entity: ${log.entity_type || log.target_type} | User: ${log.user_id} | Details: ${JSON.stringify(log.details || log.metadata || log.changes || {})}`);
      }
    }
  }

  // Check stage status and checklist items
  for (const id of ids) {
    console.log(`\n======================================================`);
    console.log(`STAGE DETAILS & CHECKLISTS FOR: ${id}`);
    console.log(`======================================================`);

    const { data: stages } = await supabase
      .from('project_stages')
      .select('id, name, status, sort_order, started_at, completed_at')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    const activeStages = stages?.filter(s => s.status !== 'not_started');
    console.log(`Active/Completed Stages for ${id}:`, JSON.stringify(activeStages, null, 2));

    const stageIds = stages?.map(s => s.id) || [];
    if (stageIds.length > 0) {
      // Check inspection items or checklist items
      const { data: checklistItems, error: clErr } = await supabase
        .from('stage_checklist_items')
        .select('*')
        .in('project_stage_id', stageIds);
      
      console.log(`Checklist items found: ${checklistItems?.length || 0}`);
      if (checklistItems && checklistItems.length > 0) {
        console.log('Checklist sample:', JSON.stringify(checklistItems.slice(0, 5), null, 2));
      }
    }
  }

  // Check if there are any site_inspections or inspection_reports in the entire DB
  const { data: inspectionsSample } = await supabase.from('site_inspections').select('*').limit(5);
  console.log('\nSample site_inspections table format:', JSON.stringify(inspectionsSample, null, 2));
}

inspectAuditAndDetails().catch(console.error);
