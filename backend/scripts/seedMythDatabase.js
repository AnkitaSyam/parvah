import { readFileSync } from 'fs';
import { supabaseAdmin } from '../config/supabase.js';

const mythDatabase = JSON.parse(
  readFileSync(new URL('../data/mythDatabase.json', import.meta.url), 'utf8')
);

const categoryById = {
  myth_papaya: 'Nutrition',
  myth_hot_cold_food: 'Nutrition',
  myth_less_food: 'Nutrition',
  myth_iron_tablets_harm: 'Medication',
  myth_avoid_immunization: 'Medication',
  myth_eclipse: 'Superstition',
  myth_ghee_easy_delivery: 'Labor & Delivery',
  myth_no_institutional_delivery: 'Labor & Delivery',
  myth_colostrum_discard: 'Newborn Care',
  myth_swelling_normal: 'Danger Signs',
  myth_home_remedy_bleeding: 'Danger Signs',
  myth_headache_ignore: 'Danger Signs',
  myth_reduced_movement_normal: 'Danger Signs'
};

const records = mythDatabase.map((myth) => ({
  external_id: myth.id,
  myth_title: myth.myth,
  common_myth: myth.myth,
  medical_fact: myth.fact,
  counseling_guidance: myth.fact,
  category: categoryById[myth.id] || 'General Care',
  source: myth.source,
  source_url: myth.sourceUrl
}));

async function seedMythDatabase() {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pregnancy_myths')
    .select('id, external_id');

  if (existingError) throw existingError;

  const expectedIds = new Set(mythDatabase.map((myth) => myth.id));
  const obsoleteIds = existing
    .filter((myth) => !expectedIds.has(myth.external_id))
    .map((myth) => myth.id);

  if (obsoleteIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('pregnancy_myths')
      .delete()
      .in('id', obsoleteIds);
    if (error) throw error;
  }

  const { error: upsertError } = await supabaseAdmin
    .from('pregnancy_myths')
    .upsert(records, { onConflict: 'external_id' });

  if (upsertError) throw upsertError;
  console.log(`Seeded ${records.length} canonical pregnancy myths.`);
}

seedMythDatabase().catch((error) => {
  console.error('Failed to seed pregnancy_myths:', error.message);
  process.exitCode = 1;
});
