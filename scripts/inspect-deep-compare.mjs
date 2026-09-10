import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function deepCompare() {
  const ids = {
    P1_Aug18: 'db8a1600-2a7b-419a-b27d-628781d3e24c',
    P2_Aug12: '3cba5495-225c-4af5-83ea-0bc965bfa62a'
  };

  for (const [label, id] of Object.entries(ids)) {
    console.log(`\n================================================================`);
    console.log(`ANALYSIS FOR ${label} (ID: ${id})`);
    console.log(`================================================================`);

    // 1. Project details
    const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
    console.log(`Project: Name="${p.name}", Code="${p.code}", CreatedAt=${p.created_at}, Location="${p.location}", PlotNo="${p.plot_no}", Phone="${p.contractor_phone}", Org="${p.supervising_organization_id}"`);

    // 2. Term Responses (Inspection Reports)
    const { data: reports } = await supabase.from('term_responses').select('*').eq('project_id', id);
    console.log(`\nInspection Reports (term_responses): ${reports?.length || 0}`);
    for (const r of reports || []) {
      console.log(`  - Report #${r.report_number}, Visit #${r.visit_number}, Date=${r.visit_date || r.created_at}, Inspector/User=${r.user_id || r.created_by}, Status=${r.status || r.approval_status}`);
    }

    // 3. Site visit requests
    const { data: visits } = await supabase.from('site_visit_requests').select('*').eq('project_id', id);
    console.log(`\nSite Visit Requests: ${visits?.length || 0}`);
    for (const v of visits || []) {
      console.log(`  - Visit ID=${v.id}, Date=${v.visit_date || v.scheduled_date || v.created_at}, Status=${v.status}, RequestedBy=${v.requested_by}`);
    }

    // 4. Translation / PDF Documents
    const { data: docs } = await supabase.from('translation_documents').select('*').eq('project_id', id);
    console.log(`\nTranslation/PDF Documents: ${docs?.length || 0}`);
    for (const d of docs || []) {
      console.log(`  - Doc ID=${d.id}, StageId=${d.project_stage_id}, ResponseId=${d.response_id}, CreatedAt=${d.created_at}`);
    }

    // 5. Participants
    const { data: parts } = await supabase.from('project_participants').select('*').eq('project_id', id);
    console.log(`\nParticipants: ${parts?.length || 0}`);
    for (const pt of parts || []) {
      console.log(`  - Role=${pt.project_role}, Name="${pt.key_contact_name || pt.organization_name}", Email=${pt.key_contact_email}, Phone=${pt.key_contact_phone}, UserId=${pt.key_contact_user_id}`);
    }

    // 6. Stages
    const { data: stages } = await supabase.from('project_stages').select('*').eq('project_id', id);
    const activeStages = stages?.filter(s => s.status !== 'not_started');
    console.log(`\nStages: Total=${stages?.length || 0}, Active/Completed=${activeStages?.length || 0}`);
    for (const s of activeStages || []) {
      console.log(`  - Stage: "${s.name}", Status=${s.status}, Started=${s.started_at}, Completed=${s.completed_at}`);
    }

    // 7. Initial documents
    try {
      const { data: initialDocs } = await supabase.from('project_initial_documents').select('*').eq('project_id', id);
      console.log(`\nInitial Documents: ${initialDocs?.length || 0}`);
      for (const idoc of initialDocs || []) {
        console.log(`  - Initial Doc: ${idoc.file_name || idoc.title || idoc.id}`);
      }
    } catch (e) {}

    // 8. Documents table
    try {
      const { data: genDocs } = await supabase.from('documents').select('*').eq('project_id', id);
      console.log(`Documents (table): ${genDocs?.length || 0}`);
    } catch (e) {}

    // 9. Letters table
    try {
      const { data: letters } = await supabase.from('letters').select('*').eq('project_id', id);
      console.log(`Letters: ${letters?.length || 0}`);
    } catch (e) {}
  }
}

deepCompare().catch(console.error);
