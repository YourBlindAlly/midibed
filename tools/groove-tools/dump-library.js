// Writes the app's built-in rhythms and grooves to library.json so the Python groove tools use the same data as the app.
// Run from the project folder:  node tools/groove-tools/dump-library.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'groovelib-'));
for (const f of ['rhythms', 'grooves']) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', f + '.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  fs.writeFileSync(path.join(out, f + '.js'), js);
}
// grooves.ts only imports types from ./config, which TypeScript removes; ./rhythms is the file written above.
const { RHYTHMS } = require(path.join(out, 'rhythms.js'));
const { GROOVES } = require(path.join(out, 'grooves.js'));
const kit = ['Kick', 'Snare', 'Hat', 'Shaker', 'Tambourine', 'Low tom', 'Mid tom', 'High tom'];
const notes = [36, 38, 42, 82, 54, 45, 47, 50];
fs.writeFileSync(path.join(__dirname, 'library.json'), JSON.stringify({ kit, notes, rhythms: RHYTHMS, grooves: GROOVES }, null, 1));
console.log(`library.json written: ${RHYTHMS.length} rhythms, ${GROOVES.length} grooves`);
