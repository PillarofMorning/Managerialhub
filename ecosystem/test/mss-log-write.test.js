// Run: node --test ecosystem/test/mss-log-write.test.js   (any TZ: the block reads the plant clock itself)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HUB = fs.readFileSync(path.join(__dirname, '..', 'hub-shared.js'), 'utf8');
const MLW = fs.readFileSync(path.join(__dirname, '..', 'mss-log-write.js'), 'utf8');
function load(hub) {
    const store = {};
    const ctx = { console, Intl, Date, JSON, Math, Object, Array, String, Number, Promise, Error, isNaN, isFinite, RegExp, encodeURIComponent, parseInt };
    ctx.window = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
    vm.createContext(ctx);
    vm.runInContext((hub || HUB) + '\n' + MLW + '\n;globalThis.__x = { MLW_KINDS, hubLogIdOf, hubCompletionKey, mlwKind, mlwBuildRow, mlwWrite, mlwRetryQueue, mlwQueueCount, mlwUndo, mlwCheckRow, mlwApi, mlwSay, mlwKindLabel, mlwMissing };', ctx);
    return ctx.__x;
}
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
const G = '6f1c2a3b-1111-4222-8333-944455556666';
const base = { equipmentGuid: '{' + G.toUpperCase() + '}', equipment: 'Spiral 1', room: 'Bakery', area: 'IBL5', kind: 'daily', cleanedBy: ['Ana Lopez', 'Luis Perez'], employeeGuids: [], markedBy: 'Lead One', minutes: 45, shiftDate: '2026-10-20', crew: 'C', source: 'Ganttly', doneAt: '2026-10-21T07:10:00Z' };
const NOW = Date.parse('2026-10-21T12:00:00Z');

// A log table in memory: ids, statecode, optional columns that may be missing, duplicate ids refused
function mockApi(opts) {
    const o = opts || {};
    const api = { rows: (o.rows || []).map(r => Object.assign({ statecode: 0 }, r)), created: [], updated: [], cols: o.cols || null, queryFail: o.queryFail || null, createFail: o.createFail || 0, ignoreId: !!o.ignoreId };
    const check = (keys) => { if (!api.cols) return; const bad = keys.find(c => api.cols.indexOf(c) === -1); if (bad) throw new Error("Could not find a property named '" + bad + "' on type 'Microsoft.Dynamics.CRM.craa5__log_'."); };
    api.query = async (t, q) => {
        if (api.queryFail) throw new Error(api.queryFail);
        check(q.select.concat((q.filter.match(/craa5_[a-z_]+(?= eq)/g) || [])));
        const id = (q.filter.match(/craa5__log_id eq ([0-9a-f-]+)/) || [])[1];
        const key = (q.filter.match(/craa5_completionkey eq '([^']+)'/) || [])[1];
        return api.rows.filter(r => r.craa5__log_id === id || (key && r.craa5_completionkey === key));
    };
    api.create = async (t, body) => {
        if (api.createFail > 0) { api.createFail--; throw new Error('Network request failed'); }
        check(Object.keys(body));
        const row = Object.assign({ statecode: 0 }, body);
        if (api.ignoreId) row.craa5__log_id = 'aaaaaaaa-0000-4000-8000-' + String(api.rows.length).padStart(12, '0');
        if (api.rows.some(r => r.craa5__log_id === row.craa5__log_id)) throw new Error('A record with matching key values already exists. 0x80040237');
        api.created.push(body); api.rows.push(row);
        return { id: row.craa5__log_id };
    };
    api.update = async (t, id, body) => {
        check(Object.keys(body).filter(k => k !== 'statecode' && k !== 'statuscode'));
        const r = api.rows.find(x => x.craa5__log_id === id);
        if (!r) throw new Error('Does not exist');
        Object.assign(r, body); api.updated.push({ id, body });
    };
    return api;
}

test('kinds: the contract kinds, the Clean Plan words and every spelling the apps use today', () => {
    const m = load();
    const cases = { full: 'daily', weekly: 'eow', midweek: 'midweek', 'auto- daily': 'daily', 'auto- shift': 'daily', 'auto- 2-week': 'eow', EOW: 'eow', W: 'eow',
        'auto- monthly': 'monthly', 'auto- 2-month': 'monthly', 'auto- 4-month': 'monthly', 'auto- deepclean': 'monthly', 'auto- quarterly': 'quarterly', 'auto- 6-month': 'semiannual',
        'auto- annual': 'annual', 'auto- allergen': 'allergen', changeover: 'changeover', 'auto- as-needed': 'other', corrective: 'corrective', banana: '', '': '' };
    Object.keys(cases).forEach(k => assert.strictEqual(m.mlwKind(k), cases[k], k));
});

test('row: every column by contract 6.3', () => {
    const m = load();
    const b = m.mlwBuildRow(Object.assign({}, base, { kind: 'weekly', employeeGuids: ['B0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'], planKey: 'w|x|y', lineKey: 'ibl5', workArea: 'SSANIBL5W' }), NOW);
    assert.ok(b.ok, b.problems.join());
    const r = b.row;
    assert.strictEqual(r.craa5_equipmentguid, G);
    assert.strictEqual(r.craa5_lastcleaned, '2026-10-20T00:00:00Z');
    assert.strictEqual(r.craa5_shiftdate, '2026-10-20');
    assert.strictEqual(r.craa5_shiftcode, 'C');
    assert.strictEqual(r.craa5_completionkey, G + '|2026-10-20|eow');
    assert.strictEqual(b.id, m.hubLogIdOf(G + '|2026-10-20|eow'));
    assert.strictEqual(r.craa5_cleankind, 'eow');
    assert.strictEqual(r.craa5_sap, 'auto-eow');
    eq([r.craa5_daily, r.craa5_weekly, r.craa5_monthly], [true, true, false]);
    assert.strictEqual(r.craa5_lastcleanedby, 'Ana Lopez / Luis Perez');
    assert.strictEqual(r.craa5_employeeguids, 'a0000000-0000-4000-8000-000000000001; b0000000-0000-4000-8000-000000000002');
    assert.strictEqual(r.craa5_laborminutes, 45);
    assert.strictEqual(r.craa5_hoursworked, 1);
    assert.strictEqual(r.craa5_pathogen, 'No');
    assert.strictEqual(r.craa5_markedby, 'Lead One');
    assert.strictEqual(r.craa5_source, 'Ganttly');
    assert.strictEqual(r.craa5_doneat, '2026-10-21T07:10:00.000Z');
    assert.strictEqual(r.craa5_plankey, 'w|x|y');
    assert.strictEqual(r.craa5_linekey, 'ibl5');
    assert.strictEqual(r.craa5_sapw, 'SSANIBL5W');
    assert.strictEqual(r.craa5_uid, 'SSANIBL5W', 'craa5_uid (primary name) = the SAP code, same as craa5_sapw');
});

test('night shift: the shift date comes from the board start on the plant clock, not the time Done was pressed', () => {
    const m = load();
    // C shift starts Tue 2026-10-20 18:00 CDT = 23:00Z; the piece is done Wed 02:10 CDT
    const b = m.mlwBuildRow(Object.assign({}, base, { shiftDate: undefined, slotStart: '2026-10-20T23:00:00Z', doneAt: '2026-10-21T07:10:00Z' }), NOW);
    assert.strictEqual(b.row.craa5_shiftdate, '2026-10-20');
    assert.strictEqual(b.row.craa5_lastcleaned, '2026-10-20T00:00:00Z');
    // no shift date at all = not saved (never dated by the clock)
    eq(m.mlwBuildRow(Object.assign({}, base, { shiftDate: undefined }), NOW).problems, ['no_day']);
});

test('flags follow the clean done (6.2): midweek daily only, monthly and longer all three, other none, allergen flag', () => {
    const m = load();
    const f = k => { const r = m.mlwBuildRow(Object.assign({}, base, { kind: k }), NOW).row; return [r.craa5_daily, r.craa5_weekly, r.craa5_monthly]; };
    eq(f('midweek'), [true, false, false]);
    eq(f('daily'), [true, false, false]);
    eq(f('quarterly'), [true, true, true]);
    eq(f('other'), [false, false, false]);
    assert.strictEqual(m.mlwBuildRow(Object.assign({}, base, { kind: 'allergen' }), NOW).row.craa5_allergenclean, 'Yes');
    assert.strictEqual(m.mlwBuildRow(base, NOW).row.craa5_allergenclean, undefined);
});

test('minutes: real person-minutes, no 1 hour minimum; minutes x heads', () => {
    const m = load();
    const b = m.mlwBuildRow(Object.assign({}, base, { minutes: undefined, durationMins: 5, heads: 2 }), NOW);
    assert.strictEqual(b.row.craa5_laborminutes, 10);
    assert.strictEqual(b.row.craa5_hoursworked, 0);
});

test('a real SAP order is kept upper case; corrective with pathogen = Yes', () => {
    const m = load();
    const b = m.mlwBuildRow(Object.assign({}, base, { kind: 'corrective', sap: 'ssansmockq', pathogen: true }), NOW);
    assert.strictEqual(b.row.craa5_sap, 'SSANSMOCKQ');
    assert.strictEqual(b.row.craa5_pathogen, 'Yes');
});

test('refuses: no id, bad id, no kind, no names, "Crew", future day, bad minutes, unknown source', () => {
    const m = load();
    const p = e => m.mlwBuildRow(Object.assign({}, base, e), NOW).problems;
    eq(p({ equipmentGuid: '' }), ['no_equipment']);
    eq(p({ equipmentGuid: 'Spiral 1' }), ['bad_equipment']);
    eq(p({ kind: 'sometimes' }), ['no_kind']);
    eq(p({ cleanedBy: [] }), ['no_names']);
    eq(p({ cleanedBy: 'Crew' }), ['crew_name']);
    eq(p({ shiftDate: '2026-10-25' }), ['future_day']);
    eq(p({ minutes: -5 }), ['bad_minutes']);
    eq(p({ source: 'Shift Start' }), ['bad_source']);
    eq(m.mlwBuildRow(Object.assign({}, base, { minutes: 600 }), NOW).warnings, ['long_minutes']);
});

test('write: saved with the fixed id; a second device gets "already" and adds nothing', async () => {
    const m = load();
    const api = mockApi();
    const a = await m.mlwWrite(api, base, { now: NOW });
    assert.strictEqual(a.status, 'saved');
    assert.strictEqual(api.created[0].craa5__log_id, a.id);
    const m2 = load();
    const b = await m2.mlwWrite(api, base, { now: NOW });
    assert.strictEqual(b.status, 'already');
    assert.strictEqual(api.rows.length, 1);
});

test('write: two devices racing (both read nothing) -> the second create hits the fixed id and reports "already"', async () => {
    const m = load();
    const api = mockApi();
    const b = m.mlwBuildRow(base, NOW);
    api.rows.push({ craa5__log_id: b.id, statecode: 0 });
    const q = api.query; api.query = async () => [];   // the read happened before the other device saved
    const r = await m.mlwWrite(api, base, { now: NOW });
    api.query = q;
    assert.strictEqual(r.status, 'already');
    assert.strictEqual(m.mlwQueueCount(), 0);
});

test('write: a row found by completion key (id not kept by the host) counts too', async () => {
    const m = load();
    const api = mockApi({ ignoreId: true });
    assert.strictEqual((await m.mlwWrite(api, base, { now: NOW })).status, 'saved');
    assert.strictEqual((await load().mlwWrite(api, base, { now: NOW })).status, 'already');
});

test('write: a different kind or a different shift date is its own row', async () => {
    const m = load();
    const api = mockApi();
    await m.mlwWrite(api, base, { now: NOW });
    assert.strictEqual((await m.mlwWrite(api, Object.assign({}, base, { kind: 'eow' }), { now: NOW })).status, 'saved');
    assert.strictEqual((await m.mlwWrite(api, Object.assign({}, base, { shiftDate: '2026-10-19' }), { now: NOW })).status, 'saved');
    assert.strictEqual(api.rows.length, 3);
});

test('undo deactivates the row (statecode 1), never deletes; done again brings it back', async () => {
    const m = load();
    const api = mockApi();
    const a = await m.mlwWrite(api, base, { now: NOW });
    const u = await m.mlwUndo(api, G, '2026-10-20', 'daily');
    assert.strictEqual(u.status, 'undone');
    assert.strictEqual(api.rows.length, 1);
    assert.strictEqual(api.rows[0].statecode, 1);
    const again = await m.mlwWrite(api, Object.assign({}, base, { minutes: 50 }), { now: NOW });
    assert.strictEqual(again.status, 'saved');
    assert.strictEqual(api.rows.length, 1);
    assert.strictEqual(api.rows[0].statecode, 0);
    assert.strictEqual(api.rows[0].craa5_laborminutes, 50);
    assert.strictEqual(a.id, again.id);
});

test('invalid entries are never sent or queued', async () => {
    const m = load();
    const api = mockApi();
    const r = await m.mlwWrite(api, Object.assign({}, base, { cleanedBy: 'Crew' }), { now: NOW });
    assert.strictEqual(r.status, 'invalid');
    assert.strictEqual(api.rows.length, 0);
    assert.strictEqual(m.mlwQueueCount(), 0);
});

test('before the new columns exist, the row is saved without them, flags kept, fixed id still stops repeats', async () => {
    const m = load();
    const oldCols = ['craa5__log_id', 'statecode', 'craa5_equipmentguid', 'craa5_equipment', 'craa5_room', 'craa5_area', 'craa5_sap', 'craa5_lastcleaned', 'craa5_lastcleanedby', 'craa5_hoursworked', 'craa5_pathogen', 'craa5_daily', 'craa5_weekly', 'craa5_monthly', 'craa5_sapw', 'craa5_allergenclean'];
    const api = mockApi({ cols: oldCols });
    const r = await m.mlwWrite(api, base, { now: NOW });
    assert.strictEqual(r.status, 'saved', r.error);
    eq(Object.keys(api.created[0]).filter(k => oldCols.indexOf(k) === -1), []);
    assert.strictEqual(api.created[0].craa5_weekly, false);
    assert.strictEqual((await m.mlwWrite(api, base, { now: NOW })).status, 'already');
    assert.strictEqual((await load().mlwWrite(api, base, { now: NOW })).status, 'already');
});

test('a failed save is queued, never dropped, and saved by the retry', async () => {
    const m = load();
    const api = mockApi({ createFail: 1 });
    assert.strictEqual((await m.mlwWrite(api, base, { now: NOW })).status, 'queued');
    assert.strictEqual(m.mlwQueueCount(), 1);
    const again = await m.mlwRetryQueue(api);
    eq([again.saved, again.left], [1, 0]);
    assert.strictEqual(api.rows.length, 1);
});

test('log cannot be read (network) -> queued; no Read rights -> saved with the fixed id', async () => {
    const m = load();
    const api = mockApi({ queryFail: 'Network request failed' });
    assert.strictEqual((await m.mlwWrite(api, base, { now: NOW })).status, 'queued');
    assert.strictEqual(api.rows.length, 0);
    const m2 = load();
    const api2 = mockApi({ queryFail: 'Principal user is missing prvReadcraa5__log_ privilege' });
    assert.strictEqual((await m2.mlwWrite(api2, base, { now: NOW })).status, 'saved');
});

test('no connection at all -> queued', async () => {
    const m = load();
    assert.strictEqual((await m.mlwWrite(null, base, { now: NOW })).status, 'queued');
    assert.strictEqual(m.mlwQueueCount(), 1);
});

test('check: the problems of rows saved by the old writers', () => {
    const m = load();
    eq(m.mlwCheckRow({ craa5_equipmentguid: G, craa5_lastcleaned: '2026-10-21T00:00:00Z', craa5_lastcleanedby: 'Crew', craa5_daily: true, craa5_pathogen: 'No' }, NOW), ['crew_name']);
    eq(m.mlwCheckRow({ craa5_equipmentguid: '', craa5_lastcleaned: '2026-10-24T00:00:00Z', craa5_lastcleanedby: 'AL', craa5_pathogen: null }, NOW), ['no_equipment', 'future_day', 'no_kind', 'no_pathogen']);
    eq(m.mlwCheckRow({ craa5_lastcleanedby: 'SKIPPED (DOWN) - AL' }, NOW), []);
    eq(m.mlwCheckRow({ craa5_equipmentguid: G, craa5_lastcleaned: '2026-10-21T00:00:00Z', craa5_lastcleanedby: 'AL', craa5_cleankind: 'midweek', craa5_pathogen: 'No' }, NOW), []);
});

test('Spanish for every message code and kind; 7-bit ASCII source', () => {
    const m = load();
    ['saved', 'already', 'queued', 'undone', 'no_equipment', 'crew_name', 'no_kind', 'no_pathogen', 'duplicate'].forEach(c => assert.notStrictEqual(m.mlwSay(c, 'es'), m.mlwSay(c, 'en'), c));
    assert.strictEqual(m.mlwSay('already', 'es'), 'Ya está en el registro MSS de este turno.');
    assert.strictEqual(m.mlwKindLabel('eow', 'es'), 'Fin de semana');
    assert.strictEqual(m.mlwKindLabel('midweek', 'en'), 'Midweek 72h');
    assert.strictEqual(/[^\x00-\x7F]/.test(MLW), false);
});

test('api: Xrm.WebApi query string (text in quotes percent-encoded) and dataApi shapes', async () => {
    const m = load();
    let q = '';
    const xrm = { WebApi: { createRecord: async () => ({}), updateRecord: async () => ({}), retrieveMultipleRecords: async (t, s) => { q = s; return { entities: [{ a: 1 }] }; } } };
    const a = m.mlwApi(xrm, null);
    const rows = await a.query('craa5__log_', { select: ['craa5__log_id'], filter: "craa5_completionkey eq 'x|2026-10-20|eow'", top: 5 });
    assert.strictEqual(q, "?$select=craa5__log_id&$filter=craa5_completionkey eq 'x%7C2026-10-20%7Ceow'&$top=5");
    assert.strictEqual(rows.length, 1);
    const d = m.mlwApi(null, { createRow: async () => ({}), updateRow: async () => ({}), queryTable: async () => ({ rows: [1, 2] }) });
    assert.strictEqual((await d.query('t', { select: [], top: 5 })).length, 2);
    assert.strictEqual(m.mlwApi(null, null), null);
});

test('saves side by side before the new columns exist: none fails because another one dropped a column first', async () => {
    const m = load();
    const oldCols = ['craa5__log_id', 'statecode', 'craa5_equipmentguid', 'craa5_equipment', 'craa5_room', 'craa5_area', 'craa5_sap', 'craa5_lastcleaned', 'craa5_lastcleanedby', 'craa5_hoursworked', 'craa5_pathogen', 'craa5_daily', 'craa5_weekly', 'craa5_monthly'];
    const api = mockApi({ cols: oldCols });
    const ids = ['11111111-1111-4111-8111-11111111111', '22222222-2222-4222-8222-22222222222', '33333333-3333-4333-8333-33333333333'];
    const res = await Promise.all([1, 2, 3, 4, 5, 6].map(i => m.mlwWrite(api, Object.assign({}, base, { equipmentGuid: ids[i % 3] + i }), { now: NOW })));
    eq(res.map(r => r.status), ['saved', 'saved', 'saved', 'saved', 'saved', 'saved']);
});

test('allergen flag of another type: the save drops only that column', async () => {
    const m = load();
    const api = mockApi();
    const c = api.create;
    api.create = async (t, body) => { if (body.craa5_allergenclean !== undefined) throw new Error("Cannot convert the literal '" + body.craa5_allergenclean + "' to the expected type 'Edm.Int32'."); return c(t, body); };
    const r = await m.mlwWrite(api, Object.assign({}, base, { kind: 'allergen' }), { now: NOW });
    assert.strictEqual(r.status, 'saved');
    assert.strictEqual(api.created[0].craa5_cleankind, 'allergen');
    assert.strictEqual(api.created[0].craa5_allergenclean, undefined);
});

test('allergen flag on a Yes/No column (v1.3): after the text is refused, true is sent, and kept for the next saves', async () => {
    const m = load();
    const api = mockApi();
    const c = api.create, tried = [];
    api.create = async (t, body) => {
        if (body.craa5_allergenclean !== undefined) tried.push(body.craa5_allergenclean);
        if (body.craa5_allergenclean !== undefined && body.craa5_allergenclean !== true) throw new Error("Cannot convert the literal 'Yes' to the expected type 'Edm.Boolean'.");
        return c(t, body);
    };
    const r = await m.mlwWrite(api, Object.assign({}, base, { kind: 'egg' }), { now: NOW });
    eq([r.status, api.created[0].craa5_allergenclean, tried], ['saved', true, ['Yes', true]]);
    await m.mlwWrite(api, Object.assign({}, base, { kind: 'pecan' }), { now: NOW });
    eq([api.created[1].craa5_allergenclean, tried.length], [true, 3], 'the second save sends true straight away');
});

test('placeholder names (v1.3): "X", "-", "?" and one letter are not names; initials and real names are', () => {
    const m = load();
    ['X', 'x', '-', '?', '1', 'X / Ana Lopez', 'none', 'Unknown', 'xx'].forEach(n => eq(m.mlwBuildRow(Object.assign({}, base, { cleanedBy: n }), NOW).problems, ['not_a_name'], n));
    ['AL', 'Ana Lopez', 'Lopez, Ana / JP', 'Jose Maria'].forEach(n => eq(m.mlwBuildRow(Object.assign({}, base, { cleanedBy: n }), NOW).problems, [], n));
    eq(m.mlwBuildRow(Object.assign({}, base, { cleanedBy: 'Crew' }), NOW).problems, ['crew_name'], '"Crew" keeps its own message');
});

test('check (v1.3): a placeholder name, and more than 24 labor hours on one piece', () => {
    const m = load();
    const row = { craa5_equipmentguid: G, craa5_lastcleaned: '2026-10-16T00:00:00Z', craa5_lastcleanedby: 'X', craa5_daily: true, craa5_pathogen: 'No' };
    eq(m.mlwCheckRow(Object.assign({}, row, { craa5_hoursworked: 143, craa5_laborminutes: null }), NOW), ['not_a_name', 'hours_high'], 'old rows: hours worked 143, no labor minutes');
    eq(m.mlwCheckRow(Object.assign({}, row, { craa5_lastcleanedby: 'AL', craa5_hoursworked: 24 }), NOW), [], '24 hours is the limit, not over it');
    eq(m.mlwCheckRow(Object.assign({}, row, { craa5_lastcleanedby: 'AL', craa5_hoursworked: 30, craa5_laborminutes: 90 }), NOW), [], 'labor minutes win over hours worked when filled');
    eq(m.mlwCheckRow(Object.assign({}, row, { craa5_lastcleanedby: 'AL', craa5_laborminutes: 1500 }), NOW), ['hours_high']);
    ['not_a_name', 'hours_high'].forEach(c => assert.notStrictEqual(m.mlwSay(c, 'es'), m.mlwSay(c, 'en'), c));
});

test('egg and pecan allergen cleans (contract 1.0.23): daily flag plus craa5_allergenclean, own completion key', () => {
    const m = load();
    for (const [raw, k] of [['egg', 'egg'], ['auto- egg', 'egg'], ['Egg allergen', 'egg'], ['huevo', 'egg'], ['pecan', 'pecan'], ['auto- pecan', 'pecan'], ['Pecan allergen', 'pecan'], ['nuez pecana', 'pecan']])
        assert.strictEqual(m.mlwKind(raw), k, raw);
    for (const k of ['egg', 'pecan']) {
        const b = m.mlwBuildRow(Object.assign({}, base, { kind: k }), NOW);
        assert.ok(b.ok, k + ' ' + b.problems);
        eq([b.row.craa5_daily, b.row.craa5_weekly, b.row.craa5_monthly, b.row.craa5_allergenclean, b.row.craa5_cleankind, b.row.craa5_sap], [true, false, false, 'Yes', k, 'auto-' + k]);
        assert.ok(b.key.endsWith('|' + k));
    }
    assert.strictEqual(m.mlwKindLabel('egg', 'es'), 'Al\u00e9rgeno huevo');
    assert.strictEqual(m.mlwKindLabel('pecan', 'es'), 'Al\u00e9rgeno nuez pecana');
});

test('egg / pecan with an old HUB SHARED (1.0) stop with old_shared instead of a row without a key', () => {
    const old = HUB.replace("'allergen', 'egg', 'pecan',", "'allergen',");
    assert.notStrictEqual(old, HUB);
    const m = load(old);
    const b = m.mlwBuildRow(Object.assign({}, base, { kind: 'egg' }), NOW);
    assert.strictEqual(b.ok, false);
    eq(b.problems, ['old_shared']);
    assert.ok(m.mlwBuildRow(base, NOW).ok);
});
