import { groq } from '../config/groq.js';
import { supabase } from '../config/supabase.js';

export async function getMythDatabase() {
  const { data, error } = await supabase
    .from('pregnancy_myths')
    .select('id, external_id, myth_title, common_myth, medical_fact, counseling_guidance, category, source, source_url')
    .order('external_id');

  if (error) {
    throw new Error(`Unable to load pregnancy myths: ${error.message}`);
  }

  return (data || []).map((myth) => ({
    id: myth.id,
    externalId: myth.external_id,
    myth: myth.common_myth,
    fact: myth.medical_fact,
    source: myth.source,
    sourceUrl: myth.source_url
  }));
}

function formatMatch(myth, targetLanguage, correctionTextLocal = myth.fact) {
  return {
    mythId: myth.id,
    catalogId: myth.externalId,
    matched: true,
    correctionTextEn: myth.fact,
    correctionTextLocal,
    targetLanguage,
    source: myth.source,
    sourceUrl: myth.sourceUrl
  };
}

export async function checkMyths(transcript, targetLanguage = 'en') {
  if (!transcript || typeof transcript !== 'string') return [];

  const mythDatabase = await getMythDatabase();
  const mythsByExternalId = new Map(mythDatabase.map((myth) => [myth.externalId, myth]));
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.includes('placeholder-groq-key') || apiKey.includes('your_groq_api_key')) {
    return runOfflineFallback(transcript, targetLanguage, mythDatabase);
  }

  const systemPrompt = `You are a medical maternal health analyst for rural India. Identify pregnancy myths mentioned in the transcript using this reference database:\n${JSON.stringify(mythDatabase.map(({ externalId, myth, fact }) => ({ id: externalId, myth, fact })), null, 2)}\n\nReturn only JSON in this shape: {"matches":[{"mythId":"database id","correctionTextLocal":"simple correction in ${targetLanguage}"}]}. Only return IDs from the reference database.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Visit transcript:\n"${transcript}"` }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    if (!Array.isArray(parsed.matches)) return [];

    return parsed.matches
      .map((match) => {
        const myth = mythsByExternalId.get(match.mythId);
        return myth ? formatMatch(myth, targetLanguage, match.correctionTextLocal || myth.fact) : null;
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Myth check failed; running offline fallback:', error.message);
    return runOfflineFallback(transcript, targetLanguage, mythDatabase);
  }
}

function runOfflineFallback(transcript, targetLanguage, mythDatabase) {
  const text = transcript.toLowerCase();
  const keywordsById = {
    myth_papaya: ['papaya', 'पपीता'], myth_hot_cold_food: ['hot food', 'cold food', 'गरम', 'ठंडा'],
    myth_colostrum_discard: ['colostrum', 'first milk', 'पीला दूध'], myth_eclipse: ['eclipse', 'ग्रहण'],
    myth_less_food: ['eat less', 'less food', 'कम खाना'], myth_no_exercise: ['bed rest', 'exercise', 'physical activity'],
    myth_swelling_normal: ['swelling', 'सूजन'], myth_home_remedy_bleeding: ['bleeding', 'vaginal bleeding', 'खून'],
    myth_iron_tablets_harm: ['iron tablet', 'folic acid', 'ifa', 'आयरन'], myth_no_institutional_delivery: ['home delivery', 'traditional birth attendant'],
    myth_fewer_anc_visits: ['antenatal', 'checkup', 'anc visit'], myth_headache_ignore: ['headache', 'सिरदर्द'],
    myth_ghee_easy_delivery: ['ghee', 'घी'], myth_avoid_immunization: ['tetanus', 'tt injection', 'vaccine'],
    myth_fasting_safe: ['fasting', 'व्रत'], myth_reduced_movement_normal: ['reduced movement', 'baby movement', 'movement less']
  };

  return mythDatabase
    .filter((myth) => keywordsById[myth.externalId]?.some((keyword) => text.includes(keyword)))
    .map((myth) => formatMatch(myth, targetLanguage));
}
