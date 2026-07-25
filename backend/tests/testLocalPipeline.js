import { transcribeAudio } from '../services/transcription.js';
import { checkMyths } from '../services/mythCheck.js';
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

  // 2. Test checkMyths in multiple languages
  const hindiTranscript = 'सूर्यग्रहण के दौरान बाहर निकलने से बच्चे पर दाग पड़ता है इसलिए उसे बाहर नहीं निकलने दिया। सास ने उसे लोहे की गोली खाने से भी मना किया है।';
  
  console.log('🔍 Testing checkMyths in HINDI...');
  try {
    const mythsHi = await checkMyths(hindiTranscript, 'hi');
    console.log('✅ Matches count:', mythsHi.length);
    mythsHi.forEach((m, i) => {
      console.log(`\n  [Match ${i+1}] Myth: ${m.mythId}`);
      console.log(`    English: ${m.correctionTextEn}`);
      console.log(`    Localized (Hindi): ${m.correctionTextLocal}`);
    });
  } catch (err) {
    console.error('❌ Myth check in Hindi failed:', err.message);
  }

  console.log('\n----------------------------------------\n');

  console.log('🔍 Testing checkMyths in MALAYALAM...');
  try {
    const mythsMl = await checkMyths(hindiTranscript, 'ml');
    console.log('✅ Matches count:', mythsMl.length);
    mythsMl.forEach((m, i) => {
      console.log(`\n  [Match ${i+1}] Myth: ${m.mythId}`);
      console.log(`    English: ${m.correctionTextEn}`);
      console.log(`    Localized (Malayalam): ${m.correctionTextLocal}`);
    });
  } catch (err) {
    console.error('❌ Myth check in Malayalam failed:', err.message);
  }

  console.log('\n----------------------------------------\n');

  console.log('🔍 Testing checkMyths in ENGLISH...');
  try {
    const mythsEn = await checkMyths(hindiTranscript, 'en');
    console.log('✅ Matches count:', mythsEn.length);
    mythsEn.forEach((m, i) => {
      console.log(`\n  [Match ${i+1}] Myth: ${m.mythId}`);
      console.log(`    English: ${m.correctionTextEn}`);
      console.log(`    Localized (English): ${m.correctionTextLocal}`);
    });
  } catch (err) {
    console.error('❌ Myth check in English failed:', err.message);
  }

  console.log('\n🎉 Local verification completed.');
}

verify();
