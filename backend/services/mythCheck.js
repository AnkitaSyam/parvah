import { groq } from '../config/groq.js';
import dotenv from 'dotenv';

dotenv.config();

// Reference Pregnancy Myths Database (Fallback & matching reference list)
const REFERENCE_MYTHS = [
  {
    id: 'myth_eclipse',
    myth_title: 'Eclipse Exposure Superstition',
    common_myth: 'Pregnant women must not step outside or look at the sun/moon during an eclipse or the baby will be born with cleft lip or birth defects.',
    counseling_en: 'Eclipses are natural astronomical events. They have no biological effect on the baby. Cleft lips or birthmarks are caused by genetics or nutritional deficiencies like lack of Folic Acid, not from stepping outside during an eclipse.',
    counseling_hi: 'दीदी, सूर्यग्रहण या चंद्रग्रहण एक प्राकृतिक खगोलीय घटना है। इससे गर्भ में पल रहे बच्चे पर कोई बुरा असर नहीं पड़ता है। जन्मजात दोष सूर्यग्रहण के कारण नहीं, बल्कि शरीर में पोषण और फोलिक एसिड की कमी या आनुवंशिक कारणों से होते हैं। ग्रहण के दौरान भी आप सामान्य काम कर सकती हैं।',
    counseling_ml: 'ഗ്രഹണം എന്നത് വെറുമൊരു പ്രകൃതി പ്രതിഭാസമാണ്. ഇത് ഗർഭസ്ഥ ശിശുവിനെ ഒരു തരത്തിലും ബാധിക്കില്ല. മുച്ചുണ്ട് പോലെയുള്ള വൈകല്യങ്ങൾ ഉണ്ടാകുന്നത് ഫोलिक ആസിഡിന്റെ കുറവ് കൊണ്ടോ അല്ലെങ്കിൽ ജനിതക കാരണങ്ങൾ കൊണ്ടോ ആണ്. ഗ്രഹണ സമയത്തും നിങ്ങൾക്ക് സാധാരണ രീതിയിൽ പുറത്തിറങ്ങാം.'
  },
  {
    id: 'myth_eating_less',
    myth_title: 'Eating Less in 1st Trimester Keeps Baby Small',
    common_myth: 'Eating normal meals during early pregnancy makes the baby grow too big for normal delivery, so women should reduce food intake.',
    counseling_en: 'Eating less during pregnancy is dangerous. It leads to maternal anemia and low birth weight. The mother needs proper nutrition and extra calories right from the first trimester to help the baby grow healthy and strong.',
    counseling_hi: 'गर्भावस्था में कम खाना बेहद खतरनाक है। इससे मां में खून की कमी होती है और बच्चा कमजोर पैदा होता है। सुरक्षित प्रसव और स्वस्थ बच्चे के लिए पहली तिमाही से ही मां को दाल, हरी सब्जियां और दूध जैसे पौष्टिक आहार ज्यादा मात्रा में लेने चाहिए।',
    counseling_ml: 'ഗർഭകാലത്ത് ഭക്ഷണം കുറച്ചു കഴിക്കുന്നത് അമ്മയ്ക്കും കുഞ്ഞിനും ഒരുപോലെ ദോഷം ചെയ്യും. ഇത് അമ്മയിൽ വിളർച്ച ഉണ്ടാക്കാനും കുഞ്ഞിന് തൂക്കക്കുറവുണ്ടാകാനും കാരണമാകും. കുഞ്ഞിന്റെ ആരോഗ്യകരമായ വളർച്ചയ്ക്ക് ആദ്യത്തെ മൂന്ന് മാസം മുതൽ തന്നെ പോഷകഗുണമുള്ള ഭക്ഷണങ്ങൾ നന്നായി കഴിക്കേണ്ടതുണ്ട്.'
  },
  {
    id: 'myth_saffron_milk',
    myth_title: 'Saffron Milk Makes Baby Fair',
    common_myth: 'Drinking saffron (kesar) milk during pregnancy guarantees a fair skin complexion for the baby.',
    counseling_en: 'Skin color is determined entirely by parental genetics, not saffron. Saffron milk is healthy because of calcium and protein in milk, but expensive saffron does not change the baby\'s skin tone.',
    counseling_hi: 'बच्चे का रंग माता-पिता के जीन पर निर्भर करता है, केसर खाने पर नहीं। दूध पीना बहुत अच्छा है क्योंकि इससे कैल्शियम मिलता है, लेकिन महंगे केसर के इस्तेमाल से बच्चे की त्वचा का रंग नहीं बदलता है। सभी रंग सुंदर और स्वस्थ होते हैं।',
    counseling_ml: 'കുഞ്ഞിന്റെ ചർമ്മത്തിന്റെ നിറം തീരുമാനിക്കുന്നത് മാതാപിതാക്കളുടെ ജനിതക ഘടനയാണ്. കുങ്കുമപ്പൂവ് കഴിക്കുന്നത് കൊണ്ട് കുഞ്ഞിന് നിറം വർദ്ധിക്കില്ല. എങ്കിലും പാലിൽ അടങ്ങിയിരിക്കുന്ന കാൽസ്യം കുഞ്ഞിന്റെ അസ്ഥികളുടെ വളർച്ചയ്ക്ക് നല്ലതായതുകൊണ്ട് പാൽ കുടിക്കുന്നത് നല്ലതാണ്.'
  },
  {
    id: 'myth_ifa_tablets',
    myth_title: 'Iron Tablets Make Fetus Dark or Heavy',
    common_myth: 'Taking Iron and Folic Acid (IFA) tablets makes the baby skin dark or baby too heavy.',
    counseling_en: 'Iron and Folic Acid (IFA) tablets prevent severe anemia and postpartum bleeding. They save lives and do not change the baby\'s skin color or make delivery difficult. Take one daily after meals.',
    counseling_hi: 'लोहे की लाल गोलियां खाने से बच्चे का रंग काला नहीं होता। यह गोलियां मां के शरीर में खून बनाती हैं जो प्रसव के समय मां और बच्चे दोनों की जान बचाने के लिए बहुत जरूरी है। रोज़ भोजन के बाद एक गोली नींबू पानी के साथ जरूर लें।',
    counseling_ml: 'ഇരുമ്പ് ഗുളികകൾ (Iron tablets) കഴിക്കുന്നത് കുഞ്ഞിന്റെ നിറം കറുപ്പാക്കുകയോ പ്രസവം ബുദ്ധിമുട്ടാക്കുകയോ ഇല്ല. ഇത് ഗർഭിണിയിൽ വിളർച്ച തടയുന്നതിനും പ്രസവ സമയത്തെ അമിത രക്തസ്രാവം ഒഴിവാക്കുന്നതിനും അത്യാവശ്യമാണ്. ദിവസവും ഓരോ ഗുളിക വീതം ആഹാരത്തിന് ശേഷം കഴിക്കുക.'
  },
  {
    id: 'myth_ghee_delivery',
    myth_title: 'Ghee in 9th Month Lubricates Birth Canal',
    common_myth: 'Drinking ghee or oil in the 9th month will grease the birth canal and make delivery smooth.',
    counseling_en: 'Ghee enters the stomach and digestive system, not the birth canal. Eating too much ghee will not lubricate delivery, but instead causes diarrhea, digestion issues, and excessive weight gain. Eat a normal, balanced diet.',
    counseling_hi: 'दीदी, घी पेट और पाचन तंत्र में जाता है, प्रसव नली में नहीं। ज्यादा घी खाने से प्रसव आसान नहीं होता, बल्कि इससे दस्त और अपच हो सकती है और वजन ज्यादा बढ़ सकता है। प्रसव प्राकृतिक रूप से गर्भाशय के संकुचन से होता है।',
    counseling_ml: 'ഒൻപതാം മാസം നെയ്യ് കുടിക്കുന്നത് കൊണ്ട് സുഖപ്രസവം നടക്കില്ല. നെയ്യ് ദഹനവ്യവസ്ഥയിലേക്കാണ് പോകുന്നത്, പ്രസവ നാളിയിലേക്കല്ല. കൂടുതൽ നെയ്യ് കഴിക്കുന്നത് വയറിളക്കത്തിനും അമിത വണ്ണത്തിനും കാരണമാകുകയേ ഉള്ളൂ. അതിനാൽ സാധാരണ പോഷകാഹാരം കഴിക്കുക.'
  },
  {
    id: 'myth_cold_foods',
    myth_title: 'Cold Water & Cold Foods Cause Fetal Colds',
    common_myth: 'Drinking cold water or eating curd gives the fetus a cold.',
    counseling_en: 'Cold foods eaten by the mother are warmed in the stomach and do not reach the fetus. Curd is highly nutritious, providing calcium and protein. Do not avoid curd or cold water out of fear of baby catching a cold.',
    counseling_hi: 'ठंडी चीजें खाने या दही खाने से पेट में बच्चे को सर्दी नहीं लगती। दही में बहुत पोषण और कैल्शियम होता है जो बच्चे की हड्डियों के विकास के लिए बहुत आवश्यक है। दही खाना बंद न करें।',
    counseling_ml: 'തണുത്ത വെള്ളം കുടിക്കുന്നത് കൊണ്ടോ തൈര് കഴിക്കുന്നത് കൊണ്ടോ ഗർഭസ്ഥശിശുവിന് ജലദോഷം ഉണ്ടാകില്ല. തൈര് കാൽസ്യത്തിന്റെ വലിയ സ്രോതസ്സാണ്. അതിനാൽ കുഞ്ഞിന് ജലദോഷം വരുമെന്ന് പേടിച്ച് തൈര് കഴിക്കാതിരിക്കരുത്.'
  }
];

/**
 * Validates the visit transcript against the reference myths database.
 * Matches are run online via Groq LLM or offline via regex fallback.
 * 
 * @param {string} transcript - Speech text from patient visit
 * @param {string} targetLanguage - Language code ('en', 'hi', 'ml')
 * @returns {Promise<Array<Object>>} Array of matched myth objects matching response shape.
 */
export async function checkMyths(transcript, targetLanguage = 'en') {
  if (!transcript || typeof transcript !== 'string') {
    return [];
  }

  const apiKey = process.env.GROQ_API_KEY;

  // Pattern-matching fallback for offline development or missing Groq API Key
  if (!apiKey || apiKey.includes('placeholder-groq-key') || apiKey.includes('your_groq_api_key')) {
    console.warn('⚠️ GROQ_API_KEY is not configured. Running offline pattern-matching myth detection.');
    return runOfflineFallback(transcript, targetLanguage);
  }

  const systemPrompt = `You are a medical maternal health analyst for rural India.
Analyze the ASHA worker's visit transcript and identify if the patient or family mentioned any of these pregnancy myths:
${JSON.stringify(REFERENCE_MYTHS.map(m => ({ id: m.id, myth_title: m.myth_title, common_myth: m.common_myth })), null, 2)}

Target Language: "${targetLanguage}"

STRICT SCHEMA RULE:
Return ONLY a raw valid JSON object with NO markdown formatting, NO backticks, and NO conversational text.
Adhere strictly to this schema:
{
  "matches": [
    {
      "mythId": "string (the matching ID e.g. myth_eclipse, myth_ifa_tablets, etc.)",
      "matched": true,
      "correctionTextEn": "string (evidence-based explanation in simple English)",
      "correctionTextLocal": "string (evidence-based explanation in ${targetLanguage === 'hi' ? 'Hindi' : targetLanguage === 'ml' ? 'Malayalam' : 'English'})",
      "targetLanguage": "${targetLanguage}"
    }
  ]
}

LLM INSTRUCTIONS FOR CONTENT:
1. Always provide the correction in English first (in correctionTextEn) regardless of targetLanguage.
2. If targetLanguage is not English, also provide it in "correctionTextLocal" in ${targetLanguage === 'hi' ? 'Hindi' : targetLanguage === 'ml' ? 'Malayalam' : 'English'} using simple, everyday spoken language a person with limited literacy could understand if read aloud, not formal or written phrasing.
3. If targetLanguage is 'en', correctionTextLocal can be the same as correctionTextEn.
4. Do not mix languages within a single version. Ensure high-quality translations for Hindi and Malayalam.`;

  const userPrompt = `Visit Transcript:\n"${transcript}"`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const rawContent = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent.trim());
    
    if (parsed && Array.isArray(parsed.matches)) {
      return parsed.matches.map(m => ({
        mythId: m.mythId,
        matched: true,
        correctionTextEn: m.correctionTextEn || '',
        correctionTextLocal: m.correctionTextLocal || m.correctionTextEn || '',
        targetLanguage: targetLanguage
      }));
    }
    return [];
  } catch (error) {
    console.error('❌ Groq LLM checkMyths failed, running offline fallback:', error.message);
    return runOfflineFallback(transcript, targetLanguage);
  }
}

/**
 * Pattern-based offline fallback myth matcher
 */
function runOfflineFallback(transcript, targetLanguage) {
  const text = transcript.toLowerCase();
  const matches = [];

  const checkMapping = [
    { keys: ['सूर्यग्रहण', 'ग्रहण', 'eclipse'], myth: REFERENCE_MYTHS[0] },
    { keys: ['कम खाना', 'eat less', 'diet restrict', 'keep baby small'], myth: REFERENCE_MYTHS[1] },
    { keys: ['केसर', 'saffron', 'kesar', 'fair'], myth: REFERENCE_MYTHS[2] },
    { keys: ['लोहे की गोली', 'iron', 'ifa', 'tablets', 'dark'], myth: REFERENCE_MYTHS[3] },
    { keys: ['घी', 'ghee', 'lubricate', 'oil'], myth: REFERENCE_MYTHS[4] },
    { keys: ['ठंडा', 'curd', 'dahi', 'cold water', 'catch cold'], myth: REFERENCE_MYTHS[5] }
  ];

  for (const item of checkMapping) {
    if (item.keys.some(k => text.includes(k))) {
      const localCorrection = targetLanguage === 'hi' 
        ? item.myth.counseling_hi 
        : targetLanguage === 'ml' 
          ? item.myth.counseling_ml 
          : item.myth.counseling_en;

      matches.push({
        mythId: item.myth.id,
        matched: true,
        correctionTextEn: item.myth.counseling_en,
        correctionTextLocal: localCorrection,
        targetLanguage: targetLanguage
      });
    }
  }

  return matches;
}
