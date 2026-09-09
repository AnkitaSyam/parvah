import { transcribeAudio } from '../services/transcription.js';
import { detectMyths } from '../services/groqMythDetector.js';
import { supabaseAdmin } from '../config/supabase.js';
import path from 'path';
import fs from 'fs';

async function verify() {
  console.log('🧪 Starting local verification of translation and transcription features...\n');

  // 1. Test transcription auto-detection with the backend-owned sample fixture.
  const sampleAudio = path.join(process.cwd(), 'tests', 'fixtures', 't-rex-roar.mp3');
  if (fs.existsSync(sampleAudio)) {
    console.log('🎙️ Testing transcribeAudio auto-detection on sample audio...');
    try {
      const result = await transcribeAudio(sampleAudio, 't-rex-roar.mp3', 'audio/mp3');
      console.log('✅ Transcription Success! Result:', result);
    } catch (err) {
      console.error('❌ Transcription Failed:', err.message);
    }
  } else {
    console.log('⚠️ Sample audio fixture not found, skipping Whisper audio test.');
  }

  console.log('\n----------------------------------------\n');

  // 2. Test detectMyths
  const hindiTranscript = 'सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया। सास ने उसे लोहे की गोली खाने से भी मना किया है।';
  
  console.log('🔍 Testing detectMyths on Hindi transcript...');
  try {
    const { data: referenceMyths } = await supabaseAdmin
      .from('pregnancy_myths')
      .select('*');

    const detected = await detectMyths(hindiTranscript, referenceMyths || []);
    console.log('✅ Matches count:', detected.length);
    detected.forEach((m, i) => {
      console.log(`\n  [Match ${i+1}] Myth Title: ${m.myth_title}`);
      console.log(`    Extracted Quote: "${m.extracted_quote}"`);
      console.log(`    Explanation: ${m.explanation}`);
      console.log(`    Severity: ${m.severity_impact}`);
    });
  } catch (err) {
    console.error('❌ Myth detection failed:', err.message);
  }

  console.log('\n🎉 Local verification completed.');
}

verify();
