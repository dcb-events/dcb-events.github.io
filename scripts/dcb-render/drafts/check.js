// Validates a draft against the playground: parse, apply, advisories, scenarios, derived DCB.
// usage: DCB_PLAYGROUND_APP=<path to playground/app> node check.js <file.dcb> | --print <index> | --list
// Defaults to the planned submodule location (<repo>/playground/app).
const fs = require('fs');
const path = require('path');
const APPDIR = process.env.DCB_PLAYGROUND_APP ? path.resolve(process.env.DCB_PLAYGROUND_APP) : path.resolve(__dirname, '../../../playground/app');
const { createSandbox, loadApp } = require(APPDIR + '/test-harness.js');
const { sandbox, store } = createSandbox();
loadApp(sandbox, ['model.js', 'evaluate.js', 'dsl.js'], {
  trailer: 'globalThis.PREDEFINED_MODELS = PREDEFINED_MODELS;',
});
const S = sandbox;
const arg = process.argv[2];
if (arg === '--print') {
  const i = Number(process.argv[3]);
  const id = S.loadPredefinedModel(i);
  console.log(S.modelToSource(S.projectState()[id]));
  process.exit(0);
}
if (arg === '--list') { S.PREDEFINED_MODELS.forEach((m, i) => console.log(i, m.slug, m.name)); process.exit(0); }
const text = fs.readFileSync(arg, 'utf8');
const parsed = S.parseModelSource(text);
console.log('diagnostics:', JSON.stringify(parsed.diagnostics, null, 1));
if (parsed.diagnostics.some((d) => d.severity === 'error' || !d.severity)) { /* continue anyway */ }
const id = S.createDcbModel('Try');
try { console.log('apply:', JSON.stringify(S.applyModelSource(id, text)).slice(0, 300)); }
catch (e) { console.log('apply failed:', e.message); process.exit(1); }
const model = S.projectState()[id];
console.log('advisories:', JSON.stringify(S.modelAdvisories(model).map((a) => a.message || a), null, 1));
try { const rep = S.sourceScenarioReport(model, S.parseModelSource(text)); console.log('scenarioReport errors/warnings:', JSON.stringify([rep.errors, rep.warnings], null, 1)); } catch (e) { console.log('report err', e.message); }
for (const [sid, sc] of Object.entries(model['scenario-definitions'] || {})) {
  const r = S.runScenario(model, sc);
  console.log(`[${r.status}] ${sc.command}: ${sc.name || ''}`, r.status !== 'current' ? JSON.stringify({ exp: r.expected, act: r.actual, reason: r.reason }) : '');
}
for (const [sid, sc] of Object.entries(model['projection-scenario-definitions'] || {})) {
  const r = S.runProjectionScenario(model, sc);
  console.log(`[${r.status}] proj ${sc.projection}: ${sc.name || ''}`, r.status !== 'current' ? JSON.stringify({ exp: r.expected, act: r.actual, reason: r.reason }) : '');
}
for (const [n, c] of Object.entries(model['command-definitions'] || {})) { try { console.log('DCB', n, JSON.stringify(S.deriveDcb(model, c)), '|', JSON.stringify(S.boundarySummary(model, c)).slice(0,200)); } catch (e) { console.log('DCB err', n, e.message); } }
if (process.env.NOPRINT) process.exit(0);
// print back
console.log('--- printed back ---');
console.log(S.modelToSource(model));
