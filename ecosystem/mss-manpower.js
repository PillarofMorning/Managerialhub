/* ============================== START MSS MANPOWER v1.1 ============================== */
// Manpower plan (projected): the labor hours the clean goals need per day, week and month, and the heads each crew needs.
// This is not a data contract section 7 number, so the screen says how it is computed. Everything here is read only:
//   - craa5_cleanplan (Production Scheduler only writes it): the window rows of published weeks (k|Monday row status 'done')
//     are the line cleans. Work = the scope rows' craa5_minutes for that line and kind (person-minutes of every piece in the
//     clean), else details.need.work, else the clean's clock minutes x the crew it assumed. When = details.cleanStart/cleanEnd.
//     Changeovers are done by the line crew and are left out.
//   - craa5_aa_assets: pieces in no line's clean plan that are flagged daily, weekly or midweek, and every piece flagged monthly,
//     6-month (craa5_month), quarterly or annual, at standard minutes (craa5_hoursrequired; a daily clean at craa5_dailymin
//     when set). These have no planned time, so they are spread evenly over the shift hours. A piece without a standard is
//     counted, never guessed.
//   - craa5_workshift: which crew is on the clock when (the same reading rules as Ganttly and Shift Start).
// Heads for a shift = its work / (its length x the share of a shift spent cleaning). Cleans that overlap are added up at every
// moment of the shift ("at once"). A crew's cleaners = its busiest (or average) shift, rounded up.
// Fixed posts (v1.1) are heads a shift needs whatever the clean minutes: supervisor, leads, trash room, steam pits. Each has whole
// heads per shift, on every shift, day shifts (start 4 AM to 3:59 PM) or night shifts, every day, Mon-Fri or Sat-Sun. A crew carries a
// post when any of its shifts needs it. A post "not in a crew" (weekday admin) is counted once, at its hours a week.
// A crew's plan = cleaners + its fixed posts + the vacation cover (none for a crew with neither).
// Shift layout (v1.1): per crew and shift start, the cleaning heads each hour needs (busiest or average of the published weeks),
// the hours where overlapping cleans need more than the crew's cleaners, and a quiet start or end where some could start later
// or leave earlier. These are suggestions; nothing is changed.
// Weeks the Scheduler has not published repeat the average published week. Needs HUB SHARED (hubPlantParts, hubWeekKey, ...).
var MP_VERSION = '1.1';
var MP_LINE_KINDS = { full: 'daily', midweek: 'midweek', weekly: 'eow', allergen: 'allergen' };
var MP_PER_YEAR = { monthly: 12, semiannual: 2, quarterly: 4, annual: 1 };
var MP_FLAG_COLS = { daily: 'craa5_dailyclean', midweek: 'craa5_midweek', weekly: 'craa5_weeklyclean', monthly: 'craa5_monthlyclean',
    semiannual: 'craa5_month', quarterly: 'craa5_quarterly', annual: 'craa5_annually' };
var MP_HOUR = 3600000, MP_MIN = 60000, MP_WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mpYes(v) { return v === true || v === 1 || /^(true|yes|si|y|1)$/i.test(String(v === undefined || v === null ? '' : v).trim()); }
function mpNum(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? null : n; }
function mpJson(s) { if (s && typeof s === 'object') return s; try { var o = JSON.parse(s || ''); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
function mpMs(v) { if (v === null || v === undefined || v === '') return 0; var t = typeof v === 'number' ? v : Date.parse(v); return isFinite(t) ? t : 0; }
function mpField(r, n) { var f = r ? r[n + '@OData.Community.Display.V1.FormattedValue'] : undefined; return f !== undefined ? f : (r ? r[n] : undefined); }
function mpDow(day) { return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay(); }
function mpRound1(n) { return Math.round((n || 0) * 10) / 10; }

// A plant wall-clock time (a day, plus hours that may pass 24) as epoch ms, daylight saving included.
function mpPlantMs(day, hours) {
    var want = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + hours * MP_HOUR, t = want;
    for (var i = 0; i < 4; i++) {
        var p = hubPlantParts(t);
        if (!p) return want;
        var seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min), next = t + (want - seen);
        if (next === t) break;
        t = next;
    }
    return t;
}

// craa5_workshift: one row per slot. craa5_shiftcode (A-D), craa5_dayname / craa5_daynumber (1 = Sun), craa5_shiftstarthour /
// craa5_shiftendhour. Midnight is stored as 1, or every hour is stored +1 (1/7/13/19). A row that starts before 4 AM is the back
// half of a night shift: it goes on the named day or the next one, whichever overlaps the other rows less.
function mpParseSlots(rows) {
    var raw = (rows || []).map(function (r) {
        return { crew: hubCrew(mpField(r, 'craa5_shiftcode')), dayName: String(mpField(r, 'craa5_dayname') || ''), dayNum: parseInt(mpField(r, 'craa5_daynumber'), 10),
            startH: parseInt(mpField(r, 'craa5_shiftstarthour'), 10), endH: parseInt(mpField(r, 'craa5_shiftendhour'), 10) };
    });
    var hours = [];
    raw.forEach(function (x) { if (!isNaN(x.startH)) hours.push(x.startH); if (!isNaN(x.endH)) hours.push(x.endH); });
    var plusOne = hours.length > 0 && hours.every(function (h) { return h >= 1 && (h - 1) % 6 === 0; });
    var hasZeroDay = raw.some(function (x) { return x.dayNum === 0; });
    var fixHour = function (h) { return plusOne ? (h - 1 + 24) % 24 : (h === 1 || h === 24) ? 0 : ((h % 24) + 24) % 24; };
    var slots = [], pending = [];
    raw.forEach(function (x) {
        var m = x.dayName.toLowerCase().match(/sun|mon|tue|wed|thu|fri|sat/);
        var day = m ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[0]) : (isNaN(x.dayNum) ? -1 : (hasZeroDay ? x.dayNum : x.dayNum - 1));
        if (!x.crew || day < 0 || isNaN(x.startH) || isNaN(x.endH)) return;
        day = ((day % 7) + 7) % 7;
        var sH = fixHour(x.startH), eH = fixHour(x.endH);
        var slot = { crew: x.crew, day: day, startHour: sH, lengthHours: ((eH - sH + 24) % 24) || 24 };
        (sH < 4 ? pending : slots).push(slot);
    });
    var hoursOf = function (s) { var out = []; for (var h = 0; h < s.lengthHours; h++) out.push((s.day * 24 + s.startHour + h) % 168); return out; };
    pending.forEach(function (p) {
        var taken = {};
        slots.forEach(function (s) { hoursOf(s).forEach(function (h) { taken[h] = true; }); });
        var next = { crew: p.crew, day: (p.day + 1) % 7, startHour: p.startHour, lengthHours: p.lengthHours };
        var clash = function (s) { return hoursOf(s).filter(function (h) { return taken[h]; }).length; };
        slots.push(clash(p) < clash(next) ? p : next);
    });
    return slots;
}

// The shifts that START on each plant day from..to (inclusive). With no shift rows, one 24 h stretch per day (hours only, no heads).
function mpShifts(fromDay, toDay, slots) {
    var out = [], list = slots && slots.length ? slots : null;
    for (var d = fromDay; d <= toDay; d = hubAddDays(d, 1)) {
        var dow = mpDow(d);
        (list || [{ crew: '', day: dow, startHour: 0, lengthHours: 24 }]).forEach(function (s) {
            if (s.day !== dow) return;
            var start = mpPlantMs(d, s.startHour), end = mpPlantMs(d, s.startHour + s.lengthHours);
            out.push({ crew: s.crew, day: d, week: hubWeekKey(d), dow: dow, startHour: s.startHour, lengthHours: s.lengthHours, start: start, end: end,
                mins: (end - start) / MP_MIN, key: s.crew + '|' + dow + '|' + s.startHour, line: 0, spread: 0, segs: [] });
        });
    }
    return out.sort(function (a, b) { return a.start - b.start; });
}

// Scope rows (s|line|kind|part): the person-minutes of each line's clean kind, and every Equipment id that is in a line's plan.
function mpScopes(rows) {
    var out = { byKey: {}, ids: {}, count: 0 };
    (rows || []).forEach(function (r) {
        var d = mpJson(r.craa5_details) || {};
        var line = String(r.craa5_linekey || d.line || '').toLowerCase(), kind = String(r.craa5_cleankind || d.kind || '').toLowerCase();
        if (!line || !kind) return;
        var k = line + '|' + kind, s = out.byKey[k] || (out.byKey[k] = { mins: 0, pieces: 0 });
        s.mins = Math.max(s.mins, mpNum(r.craa5_minutes) || 0);
        (Array.isArray(d.pieces) ? d.pieces : []).forEach(function (p) {
            var id = hubGuid(Array.isArray(p) ? p[0] : p && p.id);
            if (hubIsGuid(id)) { if (!out.ids[id]) out.count++; out.ids[id] = true; s.pieces++; }
        });
    });
    return out;
}

// One window row -> the clean it plans: kind, work (person-minutes) and the planned slot. null for changeovers and 'none'.
function mpWindow(r, scopes) {
    var d = mpJson(r.craa5_details) || {};
    var plan = String(r.craa5_cleankind || '').toLowerCase(), kind = MP_LINE_KINDS[plan];
    if (!kind) return null;
    var line = String(r.craa5_linekey || '').toLowerCase();
    var sk = d.scope && d.scope.key ? String(d.scope.key).toLowerCase() : line + '|' + plan;
    var clock = mpNum(r.craa5_minutes) || 0, heads = d.crew ? mpNum(d.crew.heads) : null;
    var work = 0, basis = 'none';
    if (scopes && scopes.byKey[sk] && scopes.byKey[sk].mins > 0) { work = scopes.byKey[sk].mins; basis = 'scope'; }
    else if (d.need && d.need.basis === 'equipment' && mpNum(d.need.work) > 0) { work = mpNum(d.need.work); basis = 'need'; }
    else if (clock > 0 && heads > 0) { work = clock * heads; basis = 'clock'; }
    var start = mpMs(d.cleanStart) || mpMs(r.craa5_start), end = mpMs(d.cleanEnd);
    if (!(end > start)) end = clock > 0 && start ? start + clock * MP_MIN : 0;
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(r.craa5_day || '')) ? String(r.craa5_day) : (start ? hubPlantDay(start) : '');
    return { line: line, area: String(r.craa5_area || ''), plan: plan, kind: kind, day: day, week: day ? hubWeekKey(day) : '', start: start, end: end,
        work: work, basis: basis, open: !!d.open, status: String(r.craa5_status || '') };
}

// Equipment that no line's clean plan covers, and the monthly-and-longer cleans: minutes per day and per week.
function mpPieceLoads(assets, scopes, lineAreas) {
    var out = { dailyMins: 0, weeklyMins: 0, periodicWeekMins: 0, daily: 0, weekly: 0, periodic: 0, noStd: 0, inPlan: 0 };
    var useIds = scopes && scopes.count > 0;
    (assets || []).forEach(function (a) {
        var id = hubGuid(a.craa5_aa_assetsid), std = hubStdMinutes(a.craa5_hoursrequired), dmin = hubStdMinutes(a.craa5_dailymin) || std;
        var f = {};
        Object.keys(MP_FLAG_COLS).forEach(function (k) { f[k] = mpYes(a[MP_FLAG_COLS[k]]); });
        var inPlan = useIds ? !!scopes.ids[id] : !!(lineAreas && lineAreas[hubCanon(a.craa5_areaname)]);
        var missing = false;
        if (inPlan) out.inPlan++;
        else if (f.daily) { if (dmin) { out.dailyMins += dmin; out.daily++; } else missing = true; }
        else if (f.weekly || f.midweek) { if (std) { out.weeklyMins += std; out.weekly++; } else missing = true; }
        var per = 0;
        Object.keys(MP_PER_YEAR).forEach(function (k) { if (f[k]) per += MP_PER_YEAR[k]; });
        if (per) { if (std) { out.periodicWeekMins += std * per / 52; out.periodic++; } else missing = true; }
        if (missing) out.noStd++;
    });
    return out;
}

// The most people working at the same moment inside a shift, from the cleans that overlap it.
function mpPeak(inst) {
    var pts = [inst.start, inst.end];
    inst.segs.forEach(function (s) { if (s[0] > inst.start && s[0] < inst.end) pts.push(s[0]); if (s[1] > inst.start && s[1] < inst.end) pts.push(s[1]); });
    pts.sort(function (a, b) { return a - b; });
    var best = 0;
    for (var i = 0; i + 1 < pts.length; i++) {
        if (pts[i + 1] <= pts[i]) continue;
        var mid = (pts[i] + pts[i + 1]) / 2, h = 0;
        inst.segs.forEach(function (s) { if (s[0] <= mid && s[1] > mid) h += s[2]; });
        if (h > best) best = h;
    }
    return best;
}

// Fixed posts as typed on the screen -> { name, heads (whole), covers 'all' | 'day' | 'night' | 'office', days 'all' | 'weekdays' |
// 'weekend', hoursWeek (office only) }. Rows with neither a name nor heads are dropped.
function mpPosts(list) {
    return (list || []).map(function (p) {
        p = p || {};
        return { name: String(p.name || '').trim(), heads: Math.max(0, Math.round(mpNum(p.heads) || 0)),
            covers: ['all', 'day', 'night', 'office'].indexOf(p.covers) >= 0 ? p.covers : 'all',
            days: ['all', 'weekdays', 'weekend'].indexOf(p.days) >= 0 ? p.days : 'all', hoursWeek: Math.max(0, mpNum(p.hoursWeek) || 0) };
    }).filter(function (p) { return p.name || p.heads; });
}
// Does a post need people on a shift that starts on weekday dow (0 = Sun) at startHour?
function mpPostOn(p, dow, startHour) {
    if (p.covers === 'office') return false;
    var day = startHour >= 4 && startHour < 16;
    if ((p.covers === 'day' && !day) || (p.covers === 'night' && day)) return false;
    if (p.days === 'weekdays' && (dow === 0 || dow === 6)) return false;
    if (p.days === 'weekend' && dow !== 0 && dow !== 6) return false;
    return true;
}
function mpFixedOn(posts, dow, startHour) { var h = 0; posts.forEach(function (p) { if (mpPostOn(p, dow, startHour)) h += p.heads; }); return h; }

// The cleaning heads each hour of a shift needs: the overlapping cleans' work in that hour plus its share of the spread work.
function mpHourly(inst, share) {
    var out = [], len = inst.end - inst.start;
    for (var a = inst.start; a < inst.end; a += MP_HOUR) {
        var b = Math.min(a + MP_HOUR, inst.end), w = len > 0 ? inst.spread * (b - a) / len : 0;
        inst.segs.forEach(function (sg) { var x = Math.max(a, sg[0]), y = Math.min(b, sg[1]); if (y > x) w += sg[2] * (y - x) / MP_MIN; });
        out.push(w / ((b - a) / MP_MIN * share));
    }
    return out;
}

// One crew's shift, hour by hour (prof = heads per hour): the hours where overlapping cleans need more than the crew's cleaners,
// and a quiet start or end (2 hours or more) where some cleaners could start later or leave earlier. Suggestions only.
function mpShape(g, prof, cleaners, nWeeks) {
    var clock = function (i) { return (g.startHour + i) % 24; };
    var over = [], run = null, top = 0;
    prof.forEach(function (v, i) {
        if (v > top) top = v;
        if (cleaners > 0 && v > cleaners + 0.05) { if (!run) run = { from: clock(i), to: clock(i + 1), peak: v }; else { run.to = clock(i + 1); run.peak = Math.max(run.peak, v); } }
        else if (run) { over.push(run); run = null; }
    });
    if (run) over.push(run);
    over.forEach(function (r) { r.extra = Math.ceil(r.peak - cleaners - 1e-9); r.peak = mpRound1(r.peak); });
    var quiet = function (order) {
        var n = 0, hi = 0;
        for (var j = 0; j < order.length; j++) { var v = mpRound1(prof[order[j]]); if (Math.ceil(v - 1e-9) > cleaners - 1) break; n++; hi = Math.max(hi, v); }
        var spare = cleaners - Math.ceil(hi - 1e-9);
        return cleaners > 0 && n >= 2 && n < prof.length && spare >= 1 ? { hours: n, spare: spare } : null;
    };
    var fwd = prof.map(function (v, i) { return i; }), lead = quiet(fwd), trail = quiet(fwd.slice().reverse());
    if (lead) lead.at = clock(lead.hours);
    if (trail) trail.at = clock(prof.length - trail.hours);
    return { startHour: g.startHour, lengthHours: g.lengthHours, perWeek: mpRound1(g.n / Math.max(1, nWeeks)), upTo: Math.ceil(mpRound1(top) - 1e-9),
        hours: prof.map(function (v, i) { return { hour: clock(i), heads: mpRound1(v) }; }), over: over, lead: lead, trail: trail };
}

// in: { windows, weeks, scopes, assets (rows), slots (mpParseSlots), today 'YYYY-MM-DD', share (0-1 of a shift spent cleaning),
//       vacation (heads per crew), basis 'busiest' | 'average', months (default 12), logged { Monday: { mins, rows, noMins } },
//       posts (fixed posts, see mpPosts) }
function mpBuild(input) {
    var o = input || {}, share = o.share > 0 && o.share <= 1 ? o.share : 1, vac = Math.max(0, Math.round(mpNum(o.vacation) || 0));
    var slots = o.slots || [], heads = slots.length > 0, today = o.today, thisWeek = hubWeekKey(today);
    var notes = { changeover: 0, noWork: 0, basis: { scope: 0, need: 0, clock: 0 }, noTime: 0, writing: [], open: 0 };
    var done = {};
    (o.weeks || []).forEach(function (w) {
        var mon = /^\d{4}-\d{2}-\d{2}$/.test(String(w.craa5_day || '')) ? String(w.craa5_day) : (mpMs(w.craa5_start) ? hubWeekKey(hubPlantDay(mpMs(w.craa5_start) + 6 * MP_HOUR)) : '');
        if (!mon) return;
        if (String(w.craa5_status || '').toLowerCase() === 'done') done[mon] = true; else if (notes.writing.indexOf(mon) < 0) notes.writing.push(mon);
    });
    var scopes = mpScopes(o.scopes);
    var cleans = [], lineAreas = {};
    (o.windows || []).forEach(function (r) {
        var w = mpWindow(r, scopes);
        if (!w) {
            var cd = /^\d{4}-\d{2}-\d{2}$/.test(String(r.craa5_day || '')) ? String(r.craa5_day) : '';
            if (String(r.craa5_cleankind || '').toLowerCase() === 'changeover' && cd && done[hubWeekKey(cd)]) notes.changeover++;
            return;
        }
        if (!w.week || !done[w.week]) return;
        lineAreas[hubCanon(w.area)] = true;
        if (!w.work) { notes.noWork++; return; }
        notes.basis[w.basis]++;
        if (w.open) notes.open++;
        cleans.push(w);
    });
    var planned = Object.keys(done).sort();
    var weeks = planned.length ? planned : [thisWeek];
    var loads = mpPieceLoads(o.assets, scopes, lineAreas);
    var insts = mpShifts(hubAddDays(weeks[0], -1), hubAddDays(weeks[weeks.length - 1], 7), slots);
    var isBasis = {};
    weeks.forEach(function (w) { isBasis[w] = true; });
    var outside = {};
    weeks.forEach(function (w) { outside[w] = 0; });
    cleans.forEach(function (c) {
        var placed = 0;
        if (c.end > c.start) {
            var rate = c.work / ((c.end - c.start) / MP_MIN);
            insts.forEach(function (s) {
                var a = Math.max(s.start, c.start), b = Math.min(s.end, c.end);
                if (b <= a) return;
                var part = c.work * (b - a) / (c.end - c.start);
                if (isBasis[s.week]) { s.line += part; s.segs.push([a, b, rate]); placed += part; }
            });
        } else {
            notes.noTime++;
            var home = insts.filter(function (s) { return s.start <= c.start && s.end > c.start && isBasis[s.week]; })[0];
            if (home) { home.line += c.work; placed = c.work; }
        }
        outside[c.week] += c.work - placed;
    });
    // Spread: pieces outside every line plan (daily: that day's shifts; weekly: the week's) and monthly-and-longer cleans (the week's)
    weeks.forEach(function (w) {
        var wk = insts.filter(function (s) { return s.week === w; }), wkMins = wk.reduce(function (t, s) { return t + s.mins; }, 0);
        for (var i = 0; i < 7; i++) {
            var day = hubAddDays(w, i), on = wk.filter(function (s) { return s.day === day; }), m = on.reduce(function (t, s) { return t + s.mins; }, 0);
            if (m > 0) on.forEach(function (s) { s.spread += loads.dailyMins * s.mins / m; }); else outside[w] += loads.dailyMins;
        }
        var weekly = loads.weeklyMins + loads.periodicWeekMins;
        if (wkMins > 0) wk.forEach(function (s) { s.spread += weekly * s.mins / wkMins; }); else outside[w] += weekly;
    });
    var shifts = insts.filter(function (s) { return isBasis[s.week]; });
    var posts = mpPosts(o.posts), crewPosts = posts.filter(function (p) { return p.covers !== 'office' && p.heads > 0; });
    var office = posts.filter(function (p) { return p.covers === 'office' && p.heads > 0; });
    var officeWeekMins = office.reduce(function (t, p) { return t + p.heads * p.hoursWeek * 60; }, 0);
    shifts.forEach(function (s) {
        s.work = s.line + s.spread;
        s.need = s.mins > 0 ? s.work / (s.mins * share) : 0;
        s.atOnce = mpPeak(s);
        s.hourly = mpHourly(s, share);
        s.fixed = heads ? mpFixedOn(crewPosts, s.dow, s.startHour) : 0;
        delete s.segs;
    });
    // The average published week, slot by slot (crew | weekday | start hour), for the weeks not published
    var typical = {}, outsideDow = [0, 0, 0, 0, 0, 0, 0];
    shifts.forEach(function (s) {
        var t = typical[s.key] || (typical[s.key] = { crew: s.crew, dow: s.dow, startHour: s.startHour, mins: s.mins, fixed: s.fixed, work: 0, line: 0, n: 0 });
        t.work += s.work; t.line += s.line; t.n++;
    });
    Object.keys(typical).forEach(function (k) { var t = typical[k]; t.work /= t.n; t.line /= t.n; t.need = t.mins > 0 ? t.work / (t.mins * share) : 0; });
    weeks.forEach(function (w) { for (var i = 0; i < 7; i++) outsideDow[i] += outside[w] / 7 / weeks.length; });
    var crewPlan = function (list) {
        var by = {};
        list.forEach(function (s) {
            if (!s.crew) return;
            var c = by[s.crew] || (by[s.crew] = { crew: s.crew, shifts: 0, work: 0, needSum: 0, busiest: null, atOnce: 0, fixedMins: 0, list: [] });
            c.shifts++; c.work += s.work; c.needSum += s.need; c.fixedMins += (s.fixed || 0) * (s.mins || 0); c.list.push(s);
            if (!c.busiest || s.need > c.busiest.need) c.busiest = s;
            if ((s.atOnce || 0) > c.atOnce) c.atOnce = s.atOnce;
        });
        return Object.keys(by).sort().map(function (k) {
            var c = by[k], avg = c.shifts ? c.needSum / c.shifts : 0, top = c.busiest ? c.busiest.need : 0, pick = o.basis === 'average' ? avg : top;
            var on = crewPosts.filter(function (p) { return c.list.some(function (s) { return mpPostOn(p, s.dow, s.startHour); }); }).map(function (p) { return { name: p.name, heads: p.heads }; });
            var fixed = on.reduce(function (t, p) { return t + p.heads; }, 0), cleaners = c.work > 0 ? Math.ceil(pick - 1e-9) : 0, any = cleaners + fixed > 0;
            return { crew: c.crew, shifts: c.shifts, hours: mpRound1(c.work / 60), avgHeads: mpRound1(avg), busiestHeads: mpRound1(top),
                busiest: c.busiest ? { day: c.busiest.day, startHour: c.busiest.startHour, dow: c.busiest.dow } : null, atOnce: mpRound1(c.atOnce),
                cleaners: cleaners, posts: on, fixed: fixed, fixedHours: mpRound1(c.fixedMins / 60), vacation: any ? vac : 0, plan: any ? cleaners + fixed + vac : 0 };
        });
    };
    var weekRows = weeks.map(function (w) {
        var wk = shifts.filter(function (s) { return s.week === w; });
        var line = wk.reduce(function (t, s) { return t + s.line; }, 0), spread = wk.reduce(function (t, s) { return t + s.spread; }, 0);
        var lg = o.logged && o.logged[w], fixedMins = wk.reduce(function (t, s) { return t + s.fixed * s.mins; }, 0) + officeWeekMins;
        return { week: w, published: !!done[w], lineHours: mpRound1(line / 60), spreadHours: mpRound1(spread / 60), outsideHours: mpRound1(outside[w] / 60), fixedHours: mpRound1(fixedMins / 60),
            hours: mpRound1((line + spread + outside[w]) / 60), cleans: cleans.filter(function (c) { return c.week === w; }).length,
            loggedHours: lg ? mpRound1(lg.mins / 60) : null, loggedRows: lg ? lg.rows : 0, loggedNoMins: lg ? lg.noMins : 0, crews: crewPlan(wk) };
    });
    // Month by month from this month: published weeks as they are, the other days as the average published week
    var months = [], n = o.months > 0 ? o.months : 12, y = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7)) - 1;
    for (var i = 0; i < n; i++) {
        var yy = y + Math.floor((m0 + i) / 12), mm = (m0 + i) % 12, first = yy + '-' + hubPad2(mm + 1) + '-01';
        var days = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(), list = [], work = 0, fromPlan = 0, fixedMins = officeWeekMins * days / 7;
        for (var k = 0; k < days; k++) {
            var day = hubAddDays(first, k), dow = mpDow(day), wk = hubWeekKey(day);
            if (isBasis[wk] && planned.length) {
                shifts.forEach(function (s) { if (s.day === day) { list.push(s); work += s.work; fixedMins += s.fixed * s.mins; } });
                work += outside[wk] / 7; fromPlan++;
            } else {
                Object.keys(typical).forEach(function (key) {
                    var t = typical[key];
                    if (t.dow !== dow) return;
                    list.push({ crew: t.crew, day: day, dow: dow, startHour: t.startHour, mins: t.mins, fixed: t.fixed, work: t.work, need: t.need, atOnce: 0 });
                    work += t.work; fixedMins += t.fixed * t.mins;
                });
                work += outsideDow[dow];
            }
        }
        months.push({ month: first.slice(0, 7), days: days, planDays: fromPlan, hours: mpRound1(work / 60), perDay: mpRound1(work / 60 / days), perWeek: mpRound1(work / 60 / days * 7),
            fixedHours: mpRound1(fixedMins / 60), crews: crewPlan(list) });
    }
    var yearHours = months.reduce(function (t, x) { return t + x.hours; }, 0), yearDays = months.reduce(function (t, x) { return t + x.days; }, 0);
    var yearFixed = months.reduce(function (t, x) { return t + x.fixedHours; }, 0);
    var crews = crewPlan(shifts);
    // Shift layout: per crew and shift start, the heads each hour needs over the published weeks
    var groups = {};
    shifts.forEach(function (s) {
        if (!s.crew) return;
        var k = s.crew + '|' + s.startHour + '|' + s.lengthHours, g = groups[k] || (groups[k] = { crew: s.crew, startHour: s.startHour, lengthHours: s.lengthHours, n: 0, sum: [], max: [], cnt: [] });
        g.n++;
        s.hourly.forEach(function (v, i) { g.sum[i] = (g.sum[i] || 0) + v; g.cnt[i] = (g.cnt[i] || 0) + 1; g.max[i] = Math.max(g.max[i] || 0, v); });
    });
    var layout = crews.map(function (c) {
        var mine = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.crew === c.crew; }).sort(function (a, b) { return a.startHour - b.startHour || b.lengthHours - a.lengthHours; });
        return { crew: c.crew, cleaners: c.cleaners, posts: c.posts, fixed: c.fixed, vacation: c.vacation, plan: c.plan,
            shifts: mine.map(function (g) { return mpShape(g, g.sum.map(function (v, i) { return o.basis === 'average' ? v / g.cnt[i] : g.max[i]; }), c.cleaners, weeks.length); }) };
    });
    notes.postsNoHeads = posts.filter(function (p) { return p.name && !p.heads; }).map(function (p) { return p.name; });
    var officeHeads = office.reduce(function (t, p) { return t + p.heads; }, 0);
    return { version: MP_VERSION, heads: heads, planned: planned, weeks: weekRows, months: months, crews: crews, loads: loads, notes: notes,
        cleans: cleans.length, perDay: mpRound1(yearHours / yearDays), perWeek: mpRound1(yearHours / yearDays * 7), perMonth: mpRound1(yearHours / months.length),
        fixedPerWeek: mpRound1(yearFixed / yearDays * 7), layout: layout, office: office.map(function (p) { return { name: p.name, heads: p.heads, hoursWeek: p.hoursWeek }; }),
        officeHeads: officeHeads, planHeads: crews.reduce(function (t, c) { return t + c.plan; }, 0) + (heads ? officeHeads : 0) };
}
/* ============================== END MSS MANPOWER v1.1 ============================== */
