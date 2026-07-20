import { transcribeAudio } from '../services/groqTranscription.js';
import { detectMyths } from '../services/groqMythDetector.js';
import { extractSymptoms } from '../services/groqSymptomExtractor.js';
import { sendSmsAlert } from '../services/twilioSMS.js';

async function runVerification() {
  console.log('🧪 Starting Parvah Core AI Pipeline Verification...\n');

  const testTranscript = `नमस्ते दीदी। मरीज रेखा देवी, उम्र 24 वर्ष, गर्भावस्था का 26वां हफ्ता है। मरीज ने बताया कि पिछले 3 दिनों से उसके पैरों में काफी सूजन (swelling) है और सुबह उठने पर तेज सिरदर्द रहता है। उसकी सास का कहना है कि सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया। इसके अलावा, सास ने उसे फॉलिक एसिड और आयरन की गोलियां (IFA tablets) खाने से मना किया है क्योंकि उनका मानना है कि लोहे की गोली से बच्चे का रंग काला हो जाता है। मरीज ने थोड़ा धुंधला दिखने (blurred vision) की भी शिकायत की। बीपी की जांच की जरूरत है।`;

  const referenceMyths = [
    {
      id: 'm-1',
      myth_title: 'Solar Eclipse Exposure Superstition',
      common_myth: 'Pregnant women must not step outside or look at the sun/moon during an eclipse or baby will be born with cleft lip.',
      medical_fact: 'Eclipses are natural astronomical events.',
      counseling_guidance: 'Counsel family that stepping outside during eclipse is safe.',
      category: 'Superstition'
    },
    {
      id: 'm-2',
      myth_title: 'Iron-Folic Acid Tablets Cause Dark Baby Skin',
      common_myth: 'Taking government-provided Iron and Folic Acid (IFA) tablets makes the baby skin dark.',
      medical_fact: 'Skin color is determined by genetics.',
      counseling_guidance: 'Encourage taking 1 IFA tablet daily after meals.',
      category: 'Medication'
    }
  ];

  // 1. Myth Detection Test
  console.log('1️⃣ Testing Myth Detection Service (JSON schema validation & 1 retry guarantee)...');
  try {
    const myths = await detectMyths(testTranscript, referenceMyths);
    console.log('✅ Myth Detection Success! Detected myths count:', myths.length);
    console.log('   Sample Detected Myth:', JSON.stringify(myths[0], null, 2));
  } catch (err) {
    console.error('❌ Myth Detection Failed:', err.message);
  }

  console.log('\n----------------------------------------\n');

  // 2. Symptom Extraction Test
  console.log('2️⃣ Testing Symptom Extraction & Risk Timeline Builder...');
  try {
    const symptomResult = await extractSymptoms(testTranscript, 26);
    console.log('✅ Symptom Extraction Success!');
    console.log('   Summary:', symptomResult.summary);
    console.log('   Extracted Symptoms Count:', symptomResult.extracted_symptoms.length);
    console.log('   Sample Symptom:', JSON.stringify(symptomResult.extracted_symptoms[0], null, 2));
  } catch (err) {
    console.error('❌ Symptom Extraction Failed:', err.message);
  }

  console.log('\n----------------------------------------\n');

  // 3. Twilio SMS Dispatch Test
  console.log('3️⃣ Testing Twilio SMS Alert Dispatcher...');
  try {
    const smsRes = await sendSmsAlert('+919876543210', 'Parvah Alert: High risk pedal edema detected for Rekha Devi.');
    console.log('✅ SMS Dispatch Success! SID:', smsRes.sid, 'Simulated:', smsRes.simulated);
  } catch (err) {
    console.error('❌ SMS Dispatch Failed:', err.message);
  }

  console.log('\n🎉 Verification Run Complete!');
}

runVerification();
