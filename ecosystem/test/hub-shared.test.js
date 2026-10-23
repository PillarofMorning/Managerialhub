// node ecosystem/test/hub-shared.test.js  - checks the shared block (run with TZ unset; the block reads America/Chicago itself)
var fs = require('fs'), path = require('path'), assert = require('assert');
var src = fs.readFileSync(path.join(__dirname, '..', 'hub-shared.js'), 'utf8');
assert.strictEqual(/[^\x00-\x7F]/.test(src), false, 'hub-shared.js must be 7-bit ASCII');
assert.strictEqual(/\\u[0-9a-fA-F]{4}/.test(src), false, 'no \\u escapes');
var store = {};
global.window = { localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); } } };
var H = new Function(src + '; return { hubCanon: hubCanon, hubLineKey: hubLineKey, hubSameName: hubSameName, hubGuid: hubGuid, hubGuidList: hubGuidList, hubSplitGuids: hubSplitGuids, hubCrew: hubCrew, hubIdFromKey: hubIdFromKey, hubPlantDay: hubPlantDay, hubShiftDate: hubShiftDate, hubShiftKey: hubShiftKey, hubDateOnlyUtc: hubDateOnlyUtc, hubDayFromDateOnly: hubDayFromDateOnly, hubWeekKey: hubWeekKey, hubCleanKind: hubCleanKind, hubCompletionKey: hubCompletionKey, hubLogIdOf: hubLogIdOf, hubStdMinutes: hubStdMinutes, hubPace: hubPace, hubShare: hubShare, hubLaborCost: hubLaborCost, hubGetLang: hubGetLang, hubSetLang: hubSetLang, hubT: hubT, hubDecodeEs: hubDecodeEs, hubManifest: hubManifest, hubManifestKey: hubManifestKey, hubSaveManifest: hubSaveManifest, hubConfigJsonOf: hubConfigJsonOf, hubPeriodKey: hubPeriodKey, hubFreqDone: hubFreqDone, hubKindRank: hubKindRank };')();
var n = 0; function ok(a, b, m) { assert.deepStrictEqual(a, b, m); n++; }
ok(H.hubLineKey('IBL4', 1), 'ibl4'); ok(H.hubLineKey('IBL 4', 1), 'ibl4'); ok(H.hubLineKey('Breading', 2), 'breading2'); ok(H.hubLineKey('Highspeed', null), 'highspeed');
ok(H.hubSameName(' Dough Room', 'dough-room'), true); ok(H.hubSameName('', ''), false);
ok(H.hubGuid('{ABC-12}'), 'abc-12');
var g1 = '11111111-2222-4333-8444-555555555555', g2 = 'AAAAAAAA-2222-4333-8444-555555555555';
ok(H.hubGuidList([g2, g1, g1, '']), '11111111-2222-4333-8444-555555555555; aaaaaaaa-2222-4333-8444-555555555555');
ok(H.hubSplitGuids('{' + g2 + '}; ' + g1 + ', junk'), [g2.toLowerCase(), g1]);
ok(H.hubCrew('256000002'), 'C'); ok(H.hubCrew(4), 'D'); ok(H.hubCrew('Shift B'), 'B'); ok(H.hubCrew('D - Nights'), 'D'); ok(H.hubCrew('xyz'), '');
// plant day: 2026-10-21 23:30 Chicago (CDT, UTC-5) = 2026-10-22T04:30Z -> still the 21st
ok(H.hubPlantDay(Date.parse('2026-10-22T04:30:00Z')), '2026-10-21');
ok(H.hubPlantDay(Date.parse('2026-10-22T05:30:00Z')), '2026-10-22');
// winter (CST, UTC-6): 2026-12-01T05:30Z = Nov 30 23:30
ok(H.hubPlantDay('2026-12-01T05:30:00Z'), '2026-11-30');
// midnight is hour 0, not 24
ok(H.hubPlantDay(Date.parse('2026-10-22T05:00:00Z')), '2026-10-22');
ok(H.hubShiftDate(Date.parse('2026-10-20T23:00:00Z')), '2026-10-20');   // Tue 18:00 night shift start
ok(H.hubShiftKey('2026-10-20', '256000002'), '2026-10-20|C');
ok(H.hubDateOnlyUtc('2026-10-20'), '2026-10-20T00:00:00Z'); ok(H.hubDateOnlyUtc('10/20/2026'), '');
ok(H.hubDayFromDateOnly('2026-10-20T00:00:00Z'), '2026-10-20');
ok(H.hubWeekKey('2026-10-21'), '2026-10-19'); ok(H.hubWeekKey('2026-10-25'), '2026-10-19'); ok(H.hubWeekKey('2026-10-19'), '2026-10-19'); ok(H.hubWeekKey('2027-01-01'), '2026-12-28');
ok(H.hubCleanKind('full'), 'daily'); ok(H.hubCleanKind('weekly'), 'eow'); ok(H.hubCleanKind('Midweek'), 'midweek'); ok(H.hubCleanKind('none'), ''); ok(H.hubCleanKind('monthly'), 'monthly');
ok(H.hubCompletionKey('{' + g2 + '}', '2026-10-20', 'weekly'), g2.toLowerCase() + '|2026-10-20|eow');
ok(H.hubCompletionKey(g1, '2026-10-20', 'none'), '');
ok(H.hubCleanKind('Egg'), 'egg'); ok(H.hubCleanKind('pecan'), 'pecan'); ok(H.hubT('Pecan allergen', 'es'), 'Alérgeno nuez pecana');
var k = H.hubCompletionKey(g1, '2026-10-20', 'daily');
ok(H.hubLogIdOf(k), H.hubLogIdOf(k)); ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(H.hubLogIdOf(k)), true);
ok(H.hubLogIdOf(k) === H.hubLogIdOf(H.hubCompletionKey(g1, '2026-10-20', 'eow')), false);
// same as swGuid in Ganttly / Manager hub (copied value from swGuid('abc'))
ok(H.hubIdFromKey('ABC'), H.hubIdFromKey('abc'));
ok(H.hubStdMinutes(35), 35); ok(H.hubStdMinutes('6'), 6); ok(H.hubStdMinutes(600), 600); ok(H.hubStdMinutes(''), null); ok(H.hubStdMinutes(0), null);
ok(H.hubPace(90, 120), 75); ok(H.hubPace(90, 0), null); ok(H.hubShare(90, 2), 45); ok(H.hubLaborCost(90, 21), 31.5);
ok(H.hubGetLang(), 'en'); store.itp_lang_v1 = 'es'; ok(H.hubGetLang(), 'es'); H.hubSetLang('en'); ok(H.hubGetLang(), 'en'); H.hubSetLang('es');
ok(H.hubT('Done'), 'Terminado'); ok(H.hubT('Allergen'), 'Alérgeno'); ok(H.hubT('Late'), 'Llegó tarde'); ok(H.hubT('Overdue'), 'Atrasado');
ok(H.hubT('Unknown words'), 'Unknown words'); ok(H.hubT('Mine', 'es', { 'Mine': 'M%io' }), 'Mío'); ok(H.hubT('Done', 'en'), 'Done');
ok(H.hubDecodeEs('%%5 %?Listo%!'), '%5 ¿Listo¡');
// frequency periods and due
ok(H.hubPeriodKey('M', '2026-10-23'), '2026-10'); ok(H.hubPeriodKey('Q', '2026-10-23'), '2026-Q4'); ok(H.hubPeriodKey('S', '2026-06-30'), '2026-H1'); ok(H.hubPeriodKey('W', '2026-10-25'), 'w2026-10-19'); ok(H.hubPeriodKey('A', '2026-01-01'), '2026'); ok(H.hubPeriodKey('X', '2026-01-01'), '');
ok(H.hubKindRank('weekly'), 3); ok(H.hubKindRank('egg'), 1);
ok(H.hubFreqDone('M', [{ day: '2026-10-02', kind: 'quarterly' }], '2026-10-23'), true); ok(H.hubFreqDone('M', [{ day: '2026-10-02', kind: 'eow' }], '2026-10-23'), false);
ok(H.hubFreqDone('Q', [{ day: '2026-09-30', kind: 'quarterly' }], '2026-10-23'), false); ok(H.hubFreqDone('W', [{ day: '2026-10-19', kind: 'eow' }], '2026-10-25'), true);
// app manifest
var man = { appId: 'Ganttly', app: 'Ganttly', version: '2.0.0', config: ['ganttly_settings'],
    tables: [{ t: 'craa5_cleancheckoff', read: ['craa5_status', 'craa5_assetguid', 'craa5_status'], write: ['craa5_status'], opt: ['craa5_shiftdate'] }, { t: 'craa5_aa_assets', names: ['craa5_aa_assets'], read: ['craa5_midweek'] }] };
var m1 = H.hubManifest(man, '2026-10-21T17:00:00Z'), m2 = H.hubManifest(JSON.parse(JSON.stringify(man)), '2026-10-22T09:00:00Z');
ok(m1.appId, 'ganttly'); ok(m1.tables[0].t, 'craa5_aa_assets'); ok(m1.tables[1].read, ['craa5_assetguid', 'craa5_status']); ok(m1.tables[1].names, ['craa5_cleancheckoff']);
ok(m1.hash, m2.hash); ok(m1.hash === H.hubManifest({ appId: 'ganttly', app: 'Ganttly', version: '2.0.1', tables: man.tables, config: man.config }).hash, false);
ok(H.hubManifestKey('Ganttly'), 'manifest|ganttly'); ok(H.hubManifest({ appId: 'bolo', config: ['PATHOGEN_BOLO_CONFIG', 'mss_x', 'PATHOGEN_BOLO_CONFIG'] }).config, ['PATHOGEN_BOLO_CONFIG', 'mss_x']); ok(/[^\x00-\x7F]/.test(JSON.stringify(m1)), false);
var db = [], calls = [];
var io = {
    query: function (t, q) { calls.push('q'); if (t === 'craa5__e_hubconfig' && !io.newTable) return Promise.reject(new Error('404')); if (!io.hasCol && q.select.indexOf('craa5_manifestjson') >= 0) return Promise.reject(new Error('Could not find a property named craa5_manifestjson')); var key = /'([^']+)'/.exec(q.filter)[1]; return Promise.resolve({ rows: db.filter(function (r) { return r.craa5_configkey === key && r.t === t; }) }); },
    create: function (t, b) { calls.push('c'); b.t = t; db.push(b); return Promise.resolve(b[t + 'id']); },
    update: function (t, id, b) { calls.push('u'); db.forEach(function (r) { if (r.craa5__0_hubconfigid === id) { for (var k in b) r[k] = b[k]; } }); return Promise.resolve(); }
};
var bad = { query: function () { return Promise.reject(new Error('403')); }, create: null, update: null };
H.hubSaveManifest(io, man).then(function (r1) {
    ok(r1, 'saved'); ok(db.length, 1); ok(db[0].craa5__0_hubconfigid, H.hubIdFromKey('hubconfig|manifest|ganttly')); ok(JSON.parse(db[0].craa5_configjson).version, '2.0.0');
    return H.hubSaveManifest(io, man);
}).then(function (r2) {
    ok(r2, 'same'); ok(calls.join(''), 'qqqcqqq');
    return H.hubSaveManifest(io, { appId: 'ganttly', app: 'Ganttly', version: '2.0.1', tables: man.tables });
}).then(function (r3) {
    ok(r3, 'saved'); ok(db.length, 1); ok(JSON.parse(db[0].craa5_configjson).version, '2.0.1');
    return H.hubSaveManifest(bad, man);
}).then(function (r4) {
    ok(r4, 'failed: 403');
    return H.hubSaveManifest(io, { app: 'x' });
}).then(function (r5) {
    ok(r5, 'failed: no appId');
    // hubconfig gains craa5_manifestjson: the list moves there, configjson keeps a stub
    io.hasCol = true;
    return H.hubSaveManifest(io, man);
}).then(function (r6) {
    ok(r6, 'saved'); ok(db.length, 1); ok(JSON.parse(db[0].craa5_manifestjson).version, '2.0.0'); ok(H.hubConfigJsonOf(db[0]), db[0].craa5_manifestjson); ok(H.hubConfigJsonOf({ craa5_configjson: '{"a":1}' }), '{"a":1}');
    return H.hubSaveManifest(io, man);
}).then(function (r7) {
    ok(r7, 'same');
    // the new _e_ Hub config exists: manifests go there, in its big craa5_configjson
    io.newTable = true;
    return H.hubSaveManifest(io, man);
}).then(function (r8) {
    ok(r8, 'saved'); ok(db.length, 2); ok(db[1].t, 'craa5__e_hubconfig'); ok(db[1].craa5__e_hubconfigid, H.hubIdFromKey('hubconfig|manifest|ganttly')); ok(JSON.parse(db[1].craa5_configjson).version, '2.0.0');
    return H.hubSaveManifest(io, man);
}).then(function (r9) {
    ok(r9, 'same');
    console.log('hub-shared: ' + n + ' checks passed');
}).catch(function (e) { console.error(e); process.exit(1); });
