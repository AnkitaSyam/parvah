import { checkMyths, getMythDatabase } from '../services/mythCheck.js';

const myths = await getMythDatabase();
if (myths.length === 0 || myths.some((myth) => !myth.sourceUrl)) {
  throw new Error('The pregnancy_myths table did not return source-traceable myths.');
}

const matches = await checkMyths('The family says an eclipse will harm the baby.', 'en');
if (!matches.some((match) => match.catalogId === 'myth_eclipse' && match.sourceUrl)) {
  throw new Error('Myth detection did not return the eclipse myth with a sourceUrl.');
}

console.log(`Myth check passed using ${myths.length} myths from pregnancy_myths.`);
