// Run: node --test tests/mss-log-input-manpower.test.js   (MSS MANPOWER block of "mss - log input"; made-up rows only, any TZ)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HUB = fs.readFileSync(path.join(__dirname, '..', 'ecosystem', 'hub-shared.js'), 'utf8');
let SRC = fs.readFileSync(path.join(__dirname, '..', 'mss - log input'), 'utf8');
const a = SRC.indexOf('/* ============================== START MSS MANPOWER'), b = SRC.indexOf('END MSS MANPOWER');
SRC = SRC.slice(a, SRC.indexOf('\n', b));
function load() {
    const ctx = { console, Intl, Date, JSON, Math, Object, Array, String, Number, isNaN, isFinite, parseInt, RegExp };
    ctx.window = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.createContext(ctx);
    vm.runInContext(HUB + '\n' + SRC + '\n;globalThis.__x = { mpPlantMs, mpParseSlots, mpShifts, mpScopes, mpWindow, mpPieceLoads, mpPeak, mpBuild, hubWeekKey };', ctx);
    return ctx.__x;
}
const eq = (x, y, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(x)), y, msg);
const m = load();
const iso = (s) => new Date(s).toISOString();

// The plant's usual rotation, as craa5_workshift rows (daynumber 1 = Sun). Made up for the test.
const SHIFT_ROWS = [
    ['A', 'Sunday', 6, 18], ['A', 'Monday', 6, 18], ['A', 'Tuesday', 6, 18], ['A', 'Wednesday', 6, 12],
    ['B', 'Wednesday', 12, 18], ['B', 'Thursday', 6, 18], ['B', 'Friday', 6, 18], ['B', 'Saturday', 6, 18],
    ['C', 'Sunday', 18, 6], ['C', 'Monday', 18, 6], ['C', 'Tuesday', 18, 6], ['C', 'Wednesday', 18, 24],
    ['D', 'Wednesday', 1, 6], ['D', 'Thursday', 18, 6], ['D', 'Friday', 18, 6], ['D', 'Saturday', 18, 6],
].map(([c, d, s, e]) => ({ craa5_shiftcode: c, craa5_dayname: d, craa5_shiftstarthour: s, craa5_shiftendhour: e }));
const G = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('plant wall time to ms, both sides of the November clock change', () => {
    assert.strictEqual(iso(m.mpPlantMs('2026-10-31', 6)), '2026-10-31T11:00:00.000Z');
    assert.strictEqual(iso(m.mpPlantMs('2026-11-01', 6)), '2026-11-01T12:00:00.000Z');
    assert.strictEqual(iso(m.mpPlantMs('2026-10-31', 30)), '2026-11-01T12:00:00.000Z', 'Sat 6 PM + 12 h ends Sun 6 AM on the wall clock');
    assert.strictEqual(iso(m.mpPlantMs('2026-03-08', 6)), '2026-03-08T11:00:00.000Z');
});

test('shift rows: midnight stored as 1, the after-midnight row moves to the day it does not clash with', () => {
    const s = m.mpParseSlots(SHIFT_ROWS);
    assert.strictEqual(s.length, 16);
    const d = s.filter(x => x.crew === 'D' && x.startHour === 0)[0];
    eq(d, { crew: 'D', day: 4, startHour: 0, lengthHours: 6 }, 'Wed 12a-6a is Thursday morning (Tuesday night C covers Wednesday morning)');
    eq(s.filter(x => x.crew === 'C' && x.day === 3)[0], { crew: 'C', day: 3, startHour: 18, lengthHours: 6 });
    const plus = m.mpParseSlots([{ craa5_shiftcode: 'A', craa5_daynumber: 2, craa5_shiftstarthour: 7, craa5_shiftendhour: 19 }]);
    eq(plus, [{ crew: 'A', day: 1, startHour: 6, lengthHours: 12 }], 'every hour stored +1 and daynumber 1 = Sun');
    eq(m.mpParseSlots([{ craa5_shiftcode: '', craa5_dayname: 'Monday', craa5_shiftstarthour: 6, craa5_shiftendhour: 18 }]), []);
});

test('shifts start on their plant day; no shift rows = one 24 h stretch per day', () => {
    const s = m.mpShifts('2026-10-24', '2026-10-24', m.mpParseSlots(SHIFT_ROWS));
    eq(s.map(x => x.crew + x.startHour + ':' + x.mins), ['B6:720', 'D18:720']);
    const none = m.mpShifts('2026-10-31', '2026-11-01', []);
    eq(none.map(x => x.mins), [1440, 1500], 'Oct 31 to Nov 1 is 25 hours on the plant clock');
});

test('window work: scope minutes first, then need.work, then clock x crew; changeovers and none are left out', () => {
    const scopes = m.mpScopes([
        { craa5_linekey: 'ibl4', craa5_cleankind: 'midweek', craa5_minutes: 900, craa5_details: JSON.stringify({ v: 1, pieces: [[G(1), 'A', 'IBL4', 'R', 30, 2, 0, ''], [G(2), 'B', 'IBL4', 'R', 20, 1, 0, 'freezer']] }) },
        { craa5_linekey: 'ibl4', craa5_cleankind: 'midweek', craa5_minutes: 900, craa5_details: JSON.stringify({ v: 1, part: 2, pieces: [[G(3), 'C', 'IBL4', 'R', 30, 2, 0, '']] }) },
    ]);
    eq([scopes.count, scopes.byKey['ibl4|midweek'].mins], [3, 900]);
    const base = { craa5_linekey: 'ibl4', craa5_day: '2026-10-21', craa5_start: '2026-10-21T08:00:00Z', craa5_minutes: 180 };
    const w = m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'midweek', craa5_details: JSON.stringify({ scope: { key: 'ibl4|midweek' }, cleanStart: '2026-10-21T09:00:00Z', cleanEnd: '2026-10-21T12:00:00Z' }) }), scopes);
    eq([w.kind, w.work, w.basis, iso(w.start), iso(w.end), w.week], ['midweek', 900, 'scope', '2026-10-21T09:00:00.000Z', '2026-10-21T12:00:00.000Z', '2026-10-19']);
    const n = m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'full', craa5_details: JSON.stringify({ need: { basis: 'equipment', work: 300 } }) }), scopes);
    eq([n.kind, n.work, n.basis, iso(n.end)], ['daily', 300, 'need', '2026-10-21T11:00:00.000Z'], 'no slot: start + clock minutes');
    const c = m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'allergen', craa5_details: JSON.stringify({ crew: { heads: 3 } }) }), scopes);
    eq([c.work, c.basis], [540, 'clock']);
    const none = m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'weekly', craa5_minutes: 0, craa5_details: '{}' }), scopes);
    eq([none.work, none.basis], [0, 'none']);
    assert.strictEqual(m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'changeover' }), scopes), null);
    assert.strictEqual(m.mpWindow(Object.assign({}, base, { craa5_cleankind: 'none' }), scopes), null);
});

test('pieces outside every line plan and monthly-and-longer cleans; no standard = counted, not guessed', () => {
    const scopes = m.mpScopes([{ craa5_linekey: 'ibl5', craa5_cleankind: 'full', craa5_minutes: 60, craa5_details: JSON.stringify({ pieces: [[G(1), 'x', 'IBL5', 'r', 60, 1, 0, '']] }) }]);
    const L = m.mpPieceLoads([
        { craa5_aa_assetsid: G(1), craa5_hoursrequired: 60, craa5_dailyclean: true, craa5_monthlyclean: true },     // in a plan: monthly only
        { craa5_aa_assetsid: G(2), craa5_hoursrequired: 30, craa5_dailymin: 20, craa5_dailyclean: 'Yes' },           // daily at daily minutes
        { craa5_aa_assetsid: G(3), craa5_hoursrequired: 45, craa5_weeklyclean: true, craa5_quarterly: true },       // weekly + quarterly
        { craa5_aa_assetsid: G(4), craa5_hoursrequired: null, craa5_dailyclean: true },                               // no standard
        { craa5_aa_assetsid: G(5), craa5_hoursrequired: 52, craa5_annually: 1, craa5_month: true },                   // 6-month + annual
    ], scopes, {});
    eq([L.inPlan, L.daily, L.dailyMins, L.weekly, L.weeklyMins, L.noStd], [1, 1, 20, 1, 45, 1]);
    assert.ok(Math.abs(L.periodicWeekMins - (60 * 12 / 52 + 45 * 4 / 52 + 52 * 3 / 52)) < 1e-9);
    const byArea = m.mpPieceLoads([{ craa5_aa_assetsid: G(9), craa5_areaname: 'IBL 5', craa5_hoursrequired: 30, craa5_dailyclean: true }], { byKey: {}, ids: {}, count: 0 }, { ibl5: true });
    eq([byArea.inPlan, byArea.dailyMins], [1, 0], 'no scope rows: a piece in a planned line area counts as in the plan');
});

const WEEK = '2026-10-19';   // Monday
const weekRow = (mon, status) => ({ craa5_rowtype: 'week', craa5_day: mon, craa5_status: status, craa5_start: mon + 'T05:00:00Z' });
const win = (kind, day, startIso, endIso, work, extra) => ({ craa5_rowtype: 'window', craa5_linekey: 'ibl5', craa5_area: 'IBL5', craa5_cleankind: kind, craa5_day: day,
    craa5_start: startIso, craa5_minutes: 0, craa5_details: JSON.stringify(Object.assign({ need: { basis: 'equipment', work: work }, cleanStart: startIso, cleanEnd: endIso }, extra || {})) });

test('a clean that crosses a shift change is split by time; overlapping cleans add up at once; +2 vacation', () => {
    // Sat Oct 24, 4 PM to 8 PM plant time (CDT = UTC-5): 960 person-minutes (4 people x 4 h). B ends 6 PM, D starts 6 PM.
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], vacation: 2, basis: 'busiest',
        windows: [win('full', '2026-10-24', '2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', 960), win('weekly', '2026-10-24', '2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', 960)] });
    const wk = r.weeks[0];
    eq([wk.week, wk.published, wk.lineHours, wk.outsideHours, wk.cleans], [WEEK, true, 32, 0, 2]);
    const b = r.crews.filter(c => c.crew === 'B')[0], d = r.crews.filter(c => c.crew === 'D')[0];
    eq([b.busiestHeads, b.atOnce, b.busiest.day, b.plan], [1.3, 8, '2026-10-24', 4], '960 of 720 min = 1.33 heads; 8 people at once; ceil + 2');
    eq([d.busiestHeads, d.atOnce, d.plan], [1.3, 8, 4]);
    eq(r.crews.filter(c => c.crew === 'A')[0].plan, 0, 'a crew with no work needs no vacation cover either');
    const avg = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], vacation: 2, basis: 'average',
        windows: [win('full', '2026-10-24', '2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', 960)] });
    const b2 = avg.crews.filter(c => c.crew === 'B')[0];
    eq([b2.shifts, b2.avgHeads, b2.plan], [4, 0.2, 3], 'B works 4 shifts (Wed half + Thu-Sat): 480 / 720 over 4 shifts, ceil + 2');
    const half = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], share: 0.5,
        windows: [win('full', '2026-10-24', '2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', 960)] });
    eq(half.crews.filter(c => c.crew === 'B')[0].busiestHeads, 1.3, 'half a shift spent cleaning doubles the heads (480 / 360)');
});

test('weeks still being written are not used; changeovers are counted apart; open stops and missing work are noted', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done'), weekRow('2026-10-26', 'writing')],
        windows: [win('full', '2026-10-27', '2026-10-27T21:00:00Z', '2026-10-28T01:00:00Z', 600), Object.assign(win('changeover', '2026-10-21', '2026-10-21T21:00:00Z', '2026-10-21T22:00:00Z', 60)),
            win('allergen', '2026-10-22', '2026-10-22T13:00:00Z', '2026-10-22T15:00:00Z', 0), win('full', '2026-10-23', '2026-10-23T13:00:00Z', '2026-10-23T15:00:00Z', 120, { open: 'read' })] });
    eq([r.planned, r.notes.writing, r.notes.changeover, r.notes.noWork, r.notes.open, r.cleans], [[WEEK], ['2026-10-26'], 1, 1, 1, 1]);
});

test('pieces outside the line plans are spread over the shift hours: daily that day, weekly and periodic that week', () => {
    const assets = [{ craa5_aa_assetsid: G(2), craa5_hoursrequired: 72, craa5_dailyclean: true }, { craa5_aa_assetsid: G(3), craa5_hoursrequired: 52, craa5_monthlyclean: true }];
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], windows: [], assets });
    const wk = r.weeks[0];
    eq([wk.lineHours, wk.spreadHours, wk.outsideHours], [0, mpR((72 * 7 + 52 * 12 / 52) / 60), 0]);
    const a = r.crews.filter(c => c.crew === 'A')[0];
    assert.ok(a.hours > 0 && a.atOnce === 0, 'spread work adds hours but never an "at once" peak');
    eq(r.loads.daily + r.loads.periodic, 2);
});
function mpR(n) { return Math.round(n * 10) / 10; }

test('no published week: line cleans are 0 and the estimate comes from Equipment flags alone', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [], windows: [win('full', '2026-10-21', '2026-10-21T21:00:00Z', '2026-10-21T23:00:00Z', 600)],
        assets: [{ craa5_aa_assetsid: G(2), craa5_hoursrequired: 60, craa5_dailyclean: true }] });
    eq([r.planned.length, r.weeks.length, r.weeks[0].published, r.weeks[0].lineHours, r.cleans], [0, 1, false, 0, 0]);
    eq(r.weeks[0].spreadHours, 7);
    eq(r.months.length, 12);
    eq([r.months[0].month, r.months[0].planDays], ['2026-10', 0], 'without a published week every day is the average week');
    eq(r.months[1].hours, 30, 'November: 30 days x 1 h');
});

test('twelve months: published weeks as they are, other days as the average published week; per day / week / month', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], vacation: 2,
        windows: [win('full', '2026-10-21', '2026-10-21T13:00:00Z', '2026-10-21T15:00:00Z', 840)], months: 12 });
    eq(r.months.map(x => x.month), ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09']);
    eq([r.months[0].planDays, r.months[0].hours], [7, 14 * 4], 'October 2026: 4 Wednesdays x 14 h (Oct 21 from the published week, the rest from the average week)');
    eq(r.months[1].hours, 14 * 4, 'November 2026 has 4 Wednesdays');
    const total = r.months.reduce((t, x) => t + x.hours, 0), days = r.months.reduce((t, x) => t + x.days, 0);
    eq([r.perDay, r.perWeek, r.perMonth], [mpR(total / days), mpR(total / days * 7), mpR(total / 12)]);
    const a = r.months[1].crews.filter(c => c.crew === 'A')[0];
    eq([a.shifts, a.busiestHeads, a.plan], [18, mpR(840 / 360), 5], 'November, crew A: 18 shifts (5 Sun, 5 Mon, 4 Tue, 4 Wed); busiest = a Wednesday morning, 840 min in a 6 h shift = 2.3 heads; ceil + 2');
});

test('no shift rows: hours are still worked out, heads are not', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: [], weeks: [weekRow(WEEK, 'done')], windows: [win('full', '2026-10-21', '2026-10-21T13:00:00Z', '2026-10-21T15:00:00Z', 120)] });
    eq([r.heads, r.weeks[0].hours, r.crews.length, r.planHeads], [false, 2, 0, 0]);
});
