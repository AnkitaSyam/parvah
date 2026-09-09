import { readFileSync } from 'fs';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Seeds public.pregnancy_myths from the canonical JSON catalog.
 *
 * The catalog previously wrote myth_title = common_myth and
 * medical_fact = counseling_guidance, so every card in the UI printed the
 * same sentence twice and the LLM received no distinct counselling material
 * to ground a script in. Each field now carries different information:
 *
 *   myth_title           short label for the UI
 *   common_myth          the belief as families actually express it
 *   medical_fact         the evidence, for the worker's record (English)
 *   counseling_guidance  what to SAY to the family (Hindi), used as the
 *                        offline counselling script and as LLM grounding
 */

const mythDatabase = JSON.parse(
  readFileSync(new URL('../data/mythDatabase.json', import.meta.url), 'utf8')
);

const META = {
  myth_papaya: {
    title: 'Papaya causes miscarriage',
    category: 'Nutrition',
    counseling: 'दीदी, पका हुआ पपीता खाना सुरक्षित है और उसमें विटामिन भी होता है। सिर्फ कच्चा या अधपका पपीता नहीं खाना चाहिए। पका पपीता खाने से गर्भपात नहीं होता।'
  },
  myth_hot_cold_food: {
    title: '"Hot" and "cold" foods harm the baby',
    category: 'Nutrition',
    counseling: 'दीदी, खाने को गरम या ठंडा मानकर छोड़ने की जरूरत नहीं है। बच्चे के लिए जरूरी है कि आप दाल, हरी सब्जी, दूध, अंडा और फल — सब कुछ थोड़ा-थोड़ा रोज खाएं। कोई भी पौष्टिक चीज़ बंद न करें।'
  },
  myth_colostrum_discard: {
    title: 'Colostrum is dirty and should be discarded',
    category: 'Newborn Care',
    counseling: 'दीदी, पहला गाढ़ा पीला दूध बच्चे का पहला टीका है। उसमें बीमारियों से लड़ने की ताकत होती है। इसे फेंकना नहीं है — जन्म के एक घंटे के भीतर बच्चे को यही दूध पिलाना है।'
  },
  myth_eclipse: {
    title: 'Eclipse exposure causes birth defects',
    category: 'Superstition',
    counseling: 'दीदी, ग्रहण एक खगोलीय घटना है, इससे पेट में पल रहे बच्चे को कोई नुकसान नहीं होता। बच्चे के अंग सही बनें इसके लिए फॉलिक एसिड की गोली रोज खाना जरूरी है — यही असली बचाव है।'
  },
  myth_less_food: {
    title: 'Eat less to keep the baby small',
    category: 'Nutrition',
    counseling: 'दीदी, कम खाने से डिलीवरी आसान नहीं होती — उल्टा माँ और बच्चा दोनों कमजोर हो जाते हैं। गर्भावस्था में रोज एक कटोरी खाना ज्यादा चाहिए। कमजोर बच्चा जन्म के बाद ज्यादा बीमार पड़ता है।'
  },
  myth_no_exercise: {
    title: 'Complete bed rest is required',
    category: 'General Care',
    counseling: 'दीदी, अगर डॉक्टर ने आराम करने को न कहा हो तो रोज थोड़ा टहलना अच्छा है। इससे पाचन ठीक रहता है, नींद अच्छी आती है और डिलीवरी में मदद मिलती है। भारी सामान उठाने से जरूर बचें।'
  },
  myth_swelling_normal: {
    title: 'All pregnancy swelling is normal',
    category: 'Danger Signs',
    counseling: 'दीदी, पैरों में थोड़ी सूजन आम बात है, लेकिन अगर हाथ या चेहरे पर अचानक सूजन आए, या साथ में सिरदर्द या धुंधला दिखे — तो यह खतरे की निशानी है। तुरंत बीपी नपवाना है, इंतजार नहीं करना।'
  },
  myth_home_remedy_bleeding: {
    title: 'Bleeding can be treated at home',
    category: 'Danger Signs',
    counseling: 'दीदी, गर्भावस्था में खून आना कभी घरेलू इलाज से ठीक करने की चीज़ नहीं है। यह जान का खतरा हो सकता है। खून दिखते ही तुरंत 108 बुलाना है और अस्पताल जाना है — देर बिल्कुल नहीं करनी।'
  },
  myth_iron_tablets_harm: {
    title: 'Iron tablets are harmful or make the baby dark',
    category: 'Medication',
    counseling: 'दीदी, बच्चे का रंग माता-पिता के जीन से तय होता है, गोली से नहीं। लोहे की गोली शरीर में खून बनाती है। खून की कमी से डिलीवरी के समय जान का खतरा होता है, इसलिए रोज एक गोली खाना जरूरी है।'
  },
  myth_no_institutional_delivery: {
    title: 'Home delivery is as safe as facility delivery',
    category: 'Labor & Delivery',
    counseling: 'दीदी, डिलीवरी के समय खून बहना या दौरे पड़ना अचानक हो सकता है — घर पर इसका इलाज संभव नहीं। अस्पताल में डॉक्टर, दवा और खून सब मौजूद रहता है। JSY योजना में पैसे भी मिलते हैं। मैं आपके साथ चलूंगी।'
  },
  myth_fewer_anc_visits: {
    title: 'Checkups are only needed if something feels wrong',
    category: 'General Care',
    counseling: 'दीदी, बीपी बढ़ना और खून की कमी — दोनों शुरू में कुछ महसूस नहीं होने देते, लेकिन खतरनाक होते हैं। इसलिए हर जाँच जरूरी है, चाहे तबीयत ठीक ही लगे। जाँच में ही समय रहते पता चल जाता है।'
  },
  myth_headache_ignore: {
    title: 'Headache in pregnancy can be ignored',
    category: 'Danger Signs',
    counseling: 'दीदी, आराम करने पर भी न जाने वाला तेज सिरदर्द गर्भावस्था में खतरे की निशानी हो सकता है — खासकर पाँचवें महीने के बाद। यह बीपी बढ़ने का संकेत है। मुझे तुरंत बताइए, बीपी नापना जरूरी है।'
  },
  myth_ghee_easy_delivery: {
    title: 'Ghee makes delivery easier',
    category: 'Labor & Delivery',
    counseling: 'दीदी, घी खाने से डिलीवरी आसान नहीं होती — इसका कोई सबूत नहीं है। ज्यादा घी से सिर्फ वजन बढ़ता है। डिलीवरी आसान बनाने के लिए खून की कमी दूर करना और अस्पताल में डिलीवरी कराना असल में काम आता है।'
  },
  myth_avoid_immunization: {
    title: 'Vaccines in pregnancy are unsafe',
    category: 'Medication',
    counseling: 'दीदी, टिटनेस का टीका माँ और नवजात दोनों को जानलेवा बीमारी से बचाता है। यह पूरी तरह सुरक्षित है और सालों से लाखों महिलाओं को लगाया जा रहा है। टीके के बाद हाथ में थोड़ा दर्द होना सामान्य है।'
  },
  myth_fasting_safe: {
    title: 'Long fasting is always safe in pregnancy',
    category: 'Nutrition',
    counseling: 'दीदी, आपकी आस्था का मैं सम्मान करती हूँ। पर लंबे उपवास से शुगर गिर सकती है और बच्चे तक खाना नहीं पहुँचता, खासकर आखिरी महीनों में। डॉक्टर से बात करके बीच-बीच में कुछ खाने का रास्ता निकाल सकते हैं।'
  },
  myth_reduced_movement_normal: {
    title: 'Reduced fetal movement near term is normal',
    category: 'Danger Signs',
    counseling: 'दीदी, आखिरी महीनों में भी बच्चे की हलचल कम नहीं होनी चाहिए। अगर हलचल घट जाए तो बाईं करवट लेटकर दो घंटे में हलचल गिनें — दस से कम हो तो उसी दिन अस्पताल जाना है। यह इंतजार करने वाली बात नहीं है।'
  }
};

const records = mythDatabase.map((myth) => {
  const meta = META[myth.id] || {};
  return {
    external_id: myth.id,
    myth_title: meta.title || myth.myth.slice(0, 80),
    common_myth: myth.myth,
    medical_fact: myth.fact,
    counseling_guidance: meta.counseling || myth.fact,
    category: meta.category || 'General Care',
    source: myth.source,
    source_url: myth.sourceUrl
  };
});

async function seedMythDatabase() {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pregnancy_myths')
    .select('id, external_id');

  if (existingError) throw existingError;

  const expectedIds = new Set(mythDatabase.map((myth) => myth.id));
  const obsoleteIds = (existing || [])
    .filter((myth) => !expectedIds.has(myth.external_id))
    .map((myth) => myth.id);

  if (obsoleteIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('pregnancy_myths')
      .delete()
      .in('id', obsoleteIds);
    if (error) throw error;
    console.log(`Removed ${obsoleteIds.length} obsolete myth row(s).`);
  }

  const { error: upsertError } = await supabaseAdmin
    .from('pregnancy_myths')
    .upsert(records, { onConflict: 'external_id' });

  if (upsertError) throw upsertError;

  const missingCounseling = records.filter((r) => r.counseling_guidance === r.medical_fact);
  console.log(`✅ Seeded ${records.length} pregnancy myths.`);
  if (missingCounseling.length > 0) {
    console.warn(`⚠️  ${missingCounseling.length} myth(s) have no Hindi counselling script and fall back to the English fact.`);
  }
  console.log('   Next: run `npm run embed:myths` to build the semantic search index.');
}

seedMythDatabase().catch((error) => {
  console.error('❌ Failed to seed pregnancy_myths:', error.message);
  process.exitCode = 1;
});
