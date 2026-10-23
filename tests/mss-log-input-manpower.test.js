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
    vm.runInContext(HUB + '\n' + SRC + '\n;globalThis.__x = { mpPlantMs, mpParseSlots, mpShifts, mpScopes, mpWindow, mpPieceLoads, mpPeak, mpBuild, mpPosts, mpPostOn, hubWeekKey };', ctx);
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

// Fixed posts (made-up heads): supervisor and 2 leads on every shift, trash room on day shifts, steam pits on weekday nights,
// one weekday admin outside the crews, and a post with no heads yet.
const POSTS = [
    { name: 'Supervisor', heads: 1, covers: 'all', days: 'all' }, { name: 'Leads', heads: 2, covers: 'all' }, { name: 'Trash room', heads: '1', covers: 'day' },
    { name: 'Steam pits', heads: 1, covers: 'night', days: 'weekdays' }, { name: 'Admin', heads: 1, covers: 'office', hoursWeek: 40 }, { name: 'Sanitor helper', heads: '' }, { name: '', heads: '' },
];

test('fixed posts: which shifts need them; bad input is cleaned up', () => {
    const p = m.mpPosts(POSTS);
    eq(p.map(x => x.name + ':' + x.heads + ':' + x.covers + ':' + x.days), ['Supervisor:1:all:all', 'Leads:2:all:all', 'Trash room:1:day:all', 'Steam pits:1:night:weekdays', 'Admin:1:office:all', 'Sanitor helper:0:all:all']);
    eq(m.mpPosts([{ name: 'x', heads: 2.6, covers: 'weird', days: 'nope' }])[0], { name: 'x', heads: 3, covers: 'all', days: 'all', hoursWeek: 0 });
    const steam = p[3];
    eq([m.mpPostOn(steam, 1, 18), m.mpPostOn(steam, 0, 18), m.mpPostOn(steam, 4, 0), m.mpPostOn(steam, 1, 6)], [true, false, true, false], 'weekday nights only; a shift starting at midnight is a night shift');
    eq([m.mpPostOn(p[2], 3, 12), m.mpPostOn(p[2], 3, 16), m.mpPostOn(p[4], 1, 8)], [true, false, false], 'a noon start is a day shift; 4 PM is night; office posts are never on a crew shift');
});

test('fixed posts add to each crew that works those shifts, with hours; office posts count once; posts without heads are listed', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], vacation: 2, basis: 'busiest', posts: POSTS,
        windows: [win('full', '2026-10-24', '2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', 960)] });
    const c = {};
    r.crews.forEach(x => { c[x.crew] = x; });
    eq([c.B.cleaners, c.B.fixed, c.B.vacation, c.B.plan], [1, 4, 2, 7], 'B: 1 cleaner (480 of 720 min) + supervisor, 2 leads, trash room + 2 vacation');
    eq(c.B.posts.map(x => x.name), ['Supervisor', 'Leads', 'Trash room']);
    eq([c.D.cleaners, c.D.fixed, c.D.plan], [1, 4, 7], 'D works weekday nights, so it carries the steam pits');
    eq([c.A.cleaners, c.A.fixed, c.A.plan], [0, 4, 6], 'A has no clean work but still needs its fixed posts and vacation cover');
    eq([c.C.fixed, c.C.plan], [4, 6]);
    eq([r.officeHeads, r.planHeads], [1, 27], 'all crews plus the weekday admin');
    eq(r.notes.postsNoHeads, ['Sanitor helper']);
    eq(r.weeks[0].fixedHours, 648 + 40, 'crew shifts: Sun 84, Mon 96, Tue 96, Wed 72, Thu 120, Fri 96, Sat 84 post-hours; plus 40 admin hours');
    const nov = r.months[1];
    eq(nov.fixedHours, mpR(5 * 84 + 5 * 96 + 4 * 96 + 4 * 72 + 4 * 120 + 4 * 96 + 4 * 84 + 40 * 30 / 7), 'November: 5 Sundays and Mondays, 4 of the other days');
    eq(nov.crews.filter(x => x.crew === 'A')[0].plan, 6);
    eq(nov.hours, r.months[1].hours, 'fixed posts do not change the cleaning hours');
});

test('shift layout: hours where overlapping cleans need more than the cleaners, and a quiet start', () => {
    // Sat Oct 24, B on 6 AM to 6 PM. Two cleans 2 PM to 6 PM (19:00Z-23:00Z), 960 person-minutes each: 8 people at once for 4 hours.
    const two = [win('full', '2026-10-24', '2026-10-24T19:00:00Z', '2026-10-24T23:00:00Z', 960), win('weekly', '2026-10-24', '2026-10-24T19:00:00Z', '2026-10-24T23:00:00Z', 960)];
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], vacation: 2, basis: 'busiest', windows: two });
    const b = r.layout.filter(x => x.crew === 'B')[0];
    eq([b.cleaners, b.plan, b.shifts.map(x => x.startHour + '/' + x.lengthHours + '/' + x.perWeek)], [3, 5, ['6/12/3', '12/6/1']], '1920 / 720 = 2.7, so 3 cleaners');
    const day = b.shifts[0];
    eq(day.hours.map(x => x.heads), [0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8]);
    eq([day.hours[0].hour, day.hours[11].hour, day.upTo], [6, 17, 8]);
    eq(day.over, [{ from: 14, to: 18, peak: 8, extra: 5 }], '2 PM to 6 PM needs 8, 5 more than the 3 cleaners');
    eq(day.lead, { hours: 8, spare: 3, at: 14 }, 'nothing before 2 PM: the 3 could start later');
    eq(day.trail, null);
    eq([b.shifts[1].upTo, b.shifts[1].lead, b.shifts[1].over], [0, null, []], 'the Wednesday half shift has no clean work');
    const avg = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], basis: 'average', windows: two });
    const ad = avg.layout.filter(x => x.crew === 'B')[0];
    eq([ad.cleaners, ad.shifts[0].hours[8].heads, ad.shifts[0].over], [1, 2.7, [{ from: 14, to: 18, peak: 2.7, extra: 2 }]], 'average: 8 people over 3 Thu-Sat shifts');
    const half = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], share: 0.5, windows: two });
    eq(half.layout.filter(x => x.crew === 'B')[0].shifts[0].upTo, 16, 'half a shift spent cleaning doubles the heads each hour');
});

test('shift layout with spread work: every hour gets its share; no shift rows = no layout', () => {
    const r = m.mpBuild({ today: '2026-10-22', slots: m.mpParseSlots(SHIFT_ROWS), weeks: [weekRow(WEEK, 'done')], windows: [], assets: [{ craa5_aa_assetsid: G(2), craa5_hoursrequired: 1440, craa5_dailyclean: true }] });
    const a = r.layout.filter(x => x.crew === 'A')[0];
    eq(a.shifts[0].hours.map(x => x.heads), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '1,440 minutes a day over 24 shift hours = 1 person every hour');
    eq([a.cleaners, a.shifts[1].lengthHours, a.shifts[1].hours[0].heads], [2, 6, 1.3], 'Wednesday has 18 shift hours (6 AM to midnight), so 80 minutes an hour: A is sized for that');
    eq([a.shifts[0].over, a.shifts[0].lead], [[], null], 'a whole shift under the cleaners is not a staggered start');
    eq(m.mpBuild({ today: '2026-10-22', slots: [], weeks: [weekRow(WEEK, 'done')], windows: [], posts: POSTS }).layout, []);
});

// ---------- crew plan from the Production Scheduler (Clean Plan 'staff' rows, reader guide 6a) ----------
function loadStaff() {
    const page = fs.readFileSync(path.join(__dirname, '..', 'mss - log input'), 'utf8');
    const s = page.indexOf('const mpWeekState = '), e = page.indexOf('const mpShiftName = ');
    const ctx = { console, Intl, Date, JSON, Math, Object, Array, String, Number, isNaN, isFinite, parseInt, RegExp };
    ctx.window = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.createContext(ctx);
    vm.runInContext(HUB + '\n' + SRC + '\nconst safeString = (v) => (v === null || v === undefined ? "" : String(v).trim());\n' + page.slice(s, e) + '\n;globalThis.__s = { mpWeekState, mpStaffPlan };', ctx);
    return ctx.__s;
}
const staffRow = (day, crew, d, status, minutes) => ({ craa5_plankey: `f|${day}|${crew}`, craa5_rowtype: 'staff', craa5_day: day, craa5_status: status || 'ok', craa5_minutes: minutes || 0,
    craa5_details: JSON.stringify(Object.assign({ v: 1, crew: /^[A-D]$/.test(crew) ? crew : '', shift: 'day', start: '06:00', hours: 12, vac: 2 }, d)) });
const kRow = (mon, status) => ({ craa5_rowtype: 'week', craa5_plankey: 'k|' + mon, craa5_day: mon, craa5_status: status });

test('crew plan: a crew is its busiest shift need + vacation, per week, as the Scheduler publishes it', () => {
    const s = loadStaff();
    const rows = [
        staffRow('2026-10-19', 'A', { need: 7, clean: 5, fixed: 2, onCrew: 4, work: { line: 300, tasks: 0, mss: 60, fixed: 1440 } }, 'short', 1800),
        staffRow('2026-10-20', 'A', { need: 8, clean: 6, fixed: 2, onCrew: 4, work: { line: 360, tasks: 30, mss: 0, fixed: 1440 } }, 'short', 1830),
        staffRow('2026-10-20', 'B', { need: 3, clean: 1, fixed: 2, onCrew: 3, shift: 'night', start: '18:00' }, 'ok', 900),
        staffRow('2026-10-19', 'day', { need: 1, clean: 1, fixed: 0, onCrew: null, vac: 2 }, 'nocrew', 480),
        staffRow('2026-10-27', 'A', { need: 9, onCrew: 4 }, 'short'),          // week of Oct 26: done
        staffRow('2026-11-03', 'A', { need: 12, onCrew: 4 }, 'short'),         // week of Nov 2: still being written -> not used
        staffRow('2026-11-10', 'A', { need: 12, onCrew: 4 }, 'short'),         // week of Nov 9: no week row -> not used
    ];
    const p = s.mpStaffPlan(rows, [kRow('2026-10-19', 'done'), kRow('2026-10-26', 'done'), kRow('2026-11-02', 'writing')]);
    eq(p.weeks.map(w => w.week), ['2026-10-19', '2026-10-26']);
    eq(p.waiting, ['2026-11-02', '2026-11-09']);
    const w = p.weeks[0];
    eq(w.crews.map(c => [c.crew, c.need, c.vacation, c.plan, c.onCrew, c.short, c.busiest.day]), [['A', 8, 2, 10, 4, 2, '2026-10-20'], ['B', 3, 2, 5, 3, 0, '2026-10-20']]);
    assert.strictEqual(w.heads, 15, 'a shift with no crew letter adds no crew');
    assert.strictEqual(w.short, 2);
    eq([w.cleanHours, w.fixedHours, w.totalHours], [12.5, 48, 83.5]);
    eq(w.shifts.map(x => x.label), ['A', 'day', 'A', 'B']);
    eq(p.weeks[1].crews.map(c => c.plan), [11]);
});

test('crew plan: broken details, a crew from the key, and a crew with no need', () => {
    const s = loadStaff();
    const rows = [
        { craa5_plankey: 'f|2026-10-21|C', craa5_day: '', craa5_status: 'ok', craa5_details: 'not json' },
        staffRow('2026-10-22', 'D', { need: 0, onCrew: 5 }),
    ];
    const p = s.mpStaffPlan(rows, [kRow('2026-10-19', 'done')]);
    eq(p.weeks[0].crews.map(c => [c.crew, c.need, c.plan, c.vacation]), [['C', 0, 0, 0], ['D', 0, 0, 0]]);
    eq(s.mpStaffPlan([], []).weeks, []);
});
