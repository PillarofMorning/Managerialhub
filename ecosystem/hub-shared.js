/* ============================== START HUB SHARED v1.3 ============================== */
// The ecosystem data contract in code (ecosystem/data-contract.md). Paste this whole block into every hub app, unchanged,
// and use these helpers instead of local copies, so every app builds the same keys, dates and numbers.
// Plain ES5 and 7-bit ASCII on purpose: it runs in every Power Apps page and passes the GEMINI.md ASCII check.
// Change it only through the contract (bump HUB_CONTRACT_VERSION and say what changed in the contract's change log).

var HUB_CONTRACT_VERSION = '1.3';
var HUB_TZ = 'America/Chicago';              // the plant's clock: every plant day and shift date is read on it

// ---------- keys ----------
// Letters and digits only, lower case: "IBL 4", "IBL-4" and "ibl4" are the same name.
function hubCanon(s) { return String(s === undefined || s === null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
// Line key, the Production Scheduler's canonLine: area "IBL4" line 1 -> "ibl4"; area "Breading" line 2 -> "breading2".
function hubLineKey(area, line) { var n = Math.floor(Number(line)); return hubCanon(area) + (n > 1 ? String(n) : ''); }
// Two area (or room) names are the same area when their hubCanon is the same.
function hubSameName(a, b) { var x = hubCanon(a); return x !== '' && x === hubCanon(b); }
// Row ids (GUIDs): lower case, no braces. Every stored GUID goes through this.
function hubGuid(v) { return String(v === undefined || v === null ? '' : v).replace(/[{}]/g, '').trim().toLowerCase(); }
function hubIsGuid(v) { return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(hubGuid(v)); }
// A list of GUIDs in one text column: "; " between them, sorted, no repeats.
function hubGuidList(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (v) { var g = hubGuid(v); if (g && !seen[g]) { seen[g] = true; out.push(g); } });
    return out.sort().join('; ');
}
function hubSplitGuids(text) { return String(text || '').split(/[;,\s]+/).map(hubGuid).filter(hubIsGuid); }
// Crew letter A-D from a choice value, a number 1-4 or a label ("Shift B", "D - Nights"). '' when it is none of these.
function hubCrew(val) {
    if (val === undefined || val === null || val === '') return '';
    var s = String(typeof val === 'object' ? (val.Label || val.Value || val.name || '') : val).toUpperCase().trim();
    if (s.indexOf('256000000') > -1 || s === '1') return 'A';
    if (s.indexOf('256000001') > -1 || s === '2') return 'B';
    if (s.indexOf('256000002') > -1 || s === '3') return 'C';
    if (s.indexOf('256000003') > -1 || s === '4') return 'D';
    var m = s.match(/(?:^|[^A-Z])([ABCD])(?=$|[^A-Z])/);
    return m ? m[1] : '';
}
// FNV-1a with four seeds, shaped like a version 4 GUID (the same swGuid as Ganttly and the Manager hub).
// A row whose id is hubIdFromKey(its key) can be saved again and again without ever making a second row.
function hubIdFromKey(key) {
    var s = String(key).toLowerCase();
    var h = function (seed) {
        var x = (0x811c9dc5 ^ (seed * 0x9e3779b1)) >>> 0;
        for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul ? Math.imul(x, 0x01000193) >>> 0 : (x * 0x01000193) >>> 0; }
        return ('0000000' + x.toString(16)).slice(-8);
    };
    var g = h(1) + h(2) + h(3) + h(4);
    return g.slice(0, 8) + '-' + g.slice(8, 12) + '-4' + g.slice(13, 16) + '-' + '89ab'.charAt(parseInt(g.charAt(16), 16) % 4) + g.slice(17, 20) + '-' + g.slice(20, 32);
}

// ---------- dates ----------
function hubPad2(n) { return (n < 10 ? '0' : '') + n; }
// Year, month, day, hour, minute of a moment on the plant clock (daylight saving included).
function hubPlantParts(ms) {
    var d = new Date(typeof ms === 'number' ? ms : Date.parse(ms));
    if (isNaN(d.getTime())) return null;
    var f = new Intl.DateTimeFormat('en-US', { timeZone: HUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    var o = {};
    f.formatToParts(d).forEach(function (p) { if (p.type !== 'literal') o[p.type] = Number(p.value); });
    return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, min: o.minute };
}
// The plant day of a moment, YYYY-MM-DD. Never toISOString().slice(0, 10): that is the UTC day.
function hubPlantDay(ms) { var p = hubPlantParts(ms); return p ? p.y + '-' + hubPad2(p.m) + '-' + hubPad2(p.d) : ''; }
// The shift date: the plant day the shift STARTED (the board's craa5_slotstart). A night shift that starts Tuesday 18:00
// and finishes Wednesday 06:00 is Tuesday's shift, for everything it does.
function hubShiftDate(slotStart) { return hubPlantDay(slotStart); }
function hubShiftKey(shiftDate, crew) { return String(shiftDate) + '|' + hubCrew(crew); }
// How a shift date goes into a Dataverse date column (MSS log craa5_lastcleaned): midnight UTC of that day,
// so every reader gets the day back with value.slice(0, 10) whatever its own clock says.
function hubDateOnlyUtc(day) { return /^\d{4}-\d{2}-\d{2}$/.test(String(day)) ? String(day) + 'T00:00:00Z' : ''; }
function hubDayFromDateOnly(v) { var s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
function hubAddDays(day, n) {
    var t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * 86400000, d = new Date(t);
    return d.getUTCFullYear() + '-' + hubPad2(d.getUTCMonth() + 1) + '-' + hubPad2(d.getUTCDate());
}
// The week key: the Monday of the plant week a day is in (weeks run Monday to Sunday, as in the Clean Plan 'k|Monday' rows).
function hubWeekKey(day) {
    var dow = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay();
    return hubAddDays(day, dow === 0 ? -6 : 1 - dow);
}

// ---------- cleans and completions ----------
// What kind of clean a completion was. The Clean Plan (Production Scheduler) uses its own words; hubCleanKind maps them.
var HUB_CLEAN_KINDS = ['daily', 'midweek', 'eow', 'allergen', 'egg', 'pecan', 'changeover', 'monthly', 'quarterly', 'semiannual', 'annual', 'corrective', 'other'];
var HUB_PLAN_KIND_MAP = { full: 'daily', weekly: 'eow', midweek: 'midweek', allergen: 'allergen', changeover: 'changeover' };
function hubCleanKind(k) {
    var s = String(k || '').toLowerCase().trim();
    if (HUB_PLAN_KIND_MAP[s]) return HUB_PLAN_KIND_MAP[s];
    return HUB_CLEAN_KINDS.indexOf(s) > -1 ? s : '';
}
// One clean of one piece of equipment on one shift date: the key that stops a second row (MSS log craa5_completionkey).
// Frequencies (the MSS Calendar's codes and ranks). A clean of rank r satisfies every frequency of rank <= r.
// A piece is done for a frequency when a satisfying clean falls in the same period as today; otherwise it is due.
var HUB_FREQS = [
    { code: 'D', kind: 'daily', rank: 1, flag: 'craa5_dailyclean' }, { code: 'MW', kind: 'midweek', rank: 2, flag: 'craa5_midweek' },
    { code: 'W', kind: 'eow', rank: 3, flag: 'craa5_weeklyclean' }, { code: 'M', kind: 'monthly', rank: 4, flag: 'craa5_monthlyclean' },
    { code: 'Q', kind: 'quarterly', rank: 5, flag: 'craa5_quarterly' }, { code: 'S', kind: 'semiannual', rank: 6, flag: 'craa5_month' },
    { code: 'A', kind: 'annual', rank: 7, flag: 'craa5_annually' }
];
var HUB_KIND_RANK = { daily: 1, allergen: 1, egg: 1, pecan: 1, changeover: 1, corrective: 1, midweek: 2, eow: 3, monthly: 4, quarterly: 5, semiannual: 6, annual: 7, other: 0 };
function hubKindRank(kind) { var k = hubCleanKind(kind); return k ? HUB_KIND_RANK[k] || 0 : 0; }
// Rank of one MSS log row: its craa5_cleankind; old rows with no kind keep their old meaning from the flags
// (daily also counts as mid-week, weekly 3, monthly also counts as quarterly to annual, no flags 9 = counts for everything).
function hubLogRank(row) {
    if (!row) return 0;
    if (hubCleanKind(row.craa5_cleankind)) return hubKindRank(row.craa5_cleankind);
    var yes = function (v) { return v === true || v === 1 || /^(yes|true|1)$/i.test(String(v === undefined || v === null ? '' : v)); };
    return yes(row.craa5_monthly) ? 7 : yes(row.craa5_weekly) ? 3 : yes(row.craa5_daily) ? 2 : 9;
}
function hubFreqRank(code) { for (var i = 0; i < HUB_FREQS.length; i++) if (HUB_FREQS[i].code === code) return HUB_FREQS[i].rank; return 0; }
// Period a plant day (YYYY-MM-DD) falls in, per frequency: day, Monday week, month, quarter, half year, year.
function hubPeriodKey(code, day) {
    var d = String(day || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    var y = d.slice(0, 4), m = Number(d.slice(5, 7));
    switch (code) {
        case 'D': return d;
        case 'MW': case 'W': return 'w' + hubWeekKey(d);
        case 'M': return y + '-' + d.slice(5, 7);
        case 'Q': return y + '-Q' + Math.ceil(m / 3);
        case 'S': return y + '-H' + (m <= 6 ? 1 : 2);
        case 'A': return y;
    }
    return '';
}
// doneDays = finished cleans as [{ day, kind }] or [{ day, rank }] (rank from hubLogRank for MSS log rows).
// True when one of rank >= the frequency is in today's period. Which days and weeks owe a job is the reader's call (section 7).
function hubFreqDone(code, doneDays, today) {
    var need = hubFreqRank(code), p = hubPeriodKey(code, today);
    if (!need || !p) return false;
    for (var i = 0; i < (doneDays || []).length; i++) {
        var x = doneDays[i];
        if (x && (x.rank !== undefined ? x.rank : hubKindRank(x.kind)) >= need && hubPeriodKey(code, x.day) === p) return true;
    }
    return false;
}
function hubCompletionKey(assetGuid, shiftDate, kind) {
    var g = hubGuid(assetGuid), k = hubCleanKind(kind);
    return g && /^\d{4}-\d{2}-\d{2}$/.test(String(shiftDate)) && k ? g + '|' + shiftDate + '|' + k : '';
}
// The MSS log row id for a completion, so a retried or second-device save updates the same row.
function hubLogIdOf(completionKey) { return completionKey ? hubIdFromKey('log|' + completionKey) : ''; }

// ---------- numbers ----------
// Standard minutes of a piece: craa5_aa_assets.craa5_hoursrequired holds MINUTES of labor. Never divide it by 60
// "when it looks big". Blank, zero or not a number -> null (unknown), never a guess.
function hubStdMinutes(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) || n <= 0 ? null : n; }
// Pace: standard minutes / actual minutes x 100, over the same pieces. 100 = on standard, 125 = a quarter faster.
function hubPace(stdMinutes, actualMinutes) { return stdMinutes > 0 && actualMinutes > 0 ? Math.round(1000 * stdMinutes / actualMinutes) / 10 : null; }
// Each person on a completion gets an equal share of its minutes.
function hubShare(minutes, people) { return people > 0 && minutes > 0 ? minutes / people : 0; }
// Labor cost of minutes at an hourly rate (dollars, two decimals).
function hubLaborCost(minutes, hourlyRate) { return minutes > 0 && hourlyRate > 0 ? Math.round(minutes * hourlyRate / 60 * 100) / 100 : 0; }

// ---------- language ----------
// One choice for every app, remembered per computer: 'en' or 'es' (Spanish, Mexico). Older per-app keys are read once.
var HUB_LANG_KEY = 'hub_lang';
var HUB_OLD_LANG_KEYS = ['itp_lang_v1', 'ss_lang_v1', 'prodsched_lang_v1', 'stillwell_mst_lang_v1', 'stillwell_org_lang_v1'];
function hubGetLang() {
    try {
        var v = window.localStorage.getItem(HUB_LANG_KEY);
        if (v === 'en' || v === 'es') return v;
        for (var i = 0; i < HUB_OLD_LANG_KEYS.length; i++) if (window.localStorage.getItem(HUB_OLD_LANG_KEYS[i]) === 'es') return 'es';
    } catch (e) {}
    return 'en';
}
function hubSetLang(l) { try { window.localStorage.setItem(HUB_LANG_KEY, l === 'es' ? 'es' : 'en'); } catch (e) {} }
// Spanish is written in ASCII with a % code per accented letter (the PBED convention):
// %a %e %i %o %u = acute a e i o u, %n = n tilde, capitals %A %E %I %O %U %N, %? and %! = opening marks, %w = u with two dots, %% = %.
var HUB_ACC = { a: 225, e: 233, i: 237, o: 243, u: 250, n: 241, A: 193, E: 201, I: 205, O: 211, U: 218, N: 209, '?': 191, '!': 161, w: 252 };
function hubDecodeEs(s) { return String(s).replace(/%([aeiounAEIOUN?!w%])/g, function (m, c) { return c === '%' ? '%' : String.fromCharCode(HUB_ACC[c]); }); }
// The shared words (data-contract.md section 9). An app's own word list adds to these; it never gives one of these another Spanish.
// Mexican plant Spanish (es-MX), usted form: computadora, celular, tomar, presionar / dar clic, llenar; never vosotros,
// ordenador, movil, coger, pulsar, rellenar.
var HUB_ES = {
    'Planned': 'Planeado', 'Started': 'En proceso', 'Done': 'Terminado', 'Skipped': 'Omitido', 'Overdue': 'Atrasado', 'At risk': 'En riesgo',
    'Daily': 'Diaria', 'Midweek 72h': 'Media semana 72h', 'End of week': 'Fin de semana', 'EOW': 'Fin de semana', 'Allergen': 'Al%ergeno', 'Egg allergen': 'Al%ergeno huevo', 'Pecan allergen': 'Al%ergeno nuez pecana',
    'Changeover': 'Cambio de producto', 'Monthly': 'Mensual', 'Quarterly': 'Trimestral', 'Semiannual': 'Semestral', 'Annual': 'Anual',
    'Corrective': 'Correctiva', 'Other': 'Otra',
    'Present': 'Presente', 'Late': 'Retardo', 'Sick': 'Enfermo', 'PTO': 'Vacaciones (PTO)', 'Left early': 'Sali%o temprano',
    'No call': 'Falta sin aviso', 'Loaned': 'Prestado', 'Training': 'Capacitaci%on',
    'Sanitor': 'Sanitizador', 'Lead': 'L%ider', 'Supervisor': 'Supervisor', 'Manager': 'Gerente',
    'Loading': 'Cargando', 'Ready': 'Listo', 'Nothing here yet': 'Todav%ia no hay datos', 'Table missing': 'Falta la tabla',
    'No access': 'Sin acceso', 'Could not load': 'No se pudo cargar',
    'Area': '%Area', 'Room': 'Cuarto', 'Line': 'L%inea', 'Equipment': 'Equipo', 'Shift': 'Turno', 'Crew': 'Cuadrilla', 'Team': 'Grupo',
    'Clean': 'Limpieza', 'Run': 'Corrida', 'Headcount': 'Personal', 'Minutes': 'Minutos', 'Standard': 'Est%andar', 'Pace': 'Ritmo',
    'On time': 'A tiempo', 'Labor cost': 'Costo de mano de obra', 'Swab': 'Hisopo', 'Pathogen': 'Pat%ogeno', 'Work order': 'Orden de trabajo',
    'Skip code': 'C%odigo de omisi%on', 'High five': 'Reconocimiento', 'Sign-off': 'Aprobaci%on', 'Help': 'Ayuda', 'Print': 'Imprimir'
};
var HUB_ES_DONE = null;
// hubT('Done') -> 'Done' or 'Terminado'. extra = the app's own { English: '%-coded Spanish' } list (optional).
function hubT(s, lang, extra) {
    if ((lang || hubGetLang()) !== 'es') return s;
    if (!HUB_ES_DONE) { HUB_ES_DONE = {}; for (var k in HUB_ES) if (Object.prototype.hasOwnProperty.call(HUB_ES, k)) HUB_ES_DONE[k] = hubDecodeEs(HUB_ES[k]); }
    if (Object.prototype.hasOwnProperty.call(HUB_ES_DONE, s)) return HUB_ES_DONE[s];
    if (extra && Object.prototype.hasOwnProperty.call(extra, s)) return hubDecodeEs(extra[s]);
    return s;
}

// ---------- look ----------
var HUB_THEME_KEY = 'hub_theme';          // 'light' or 'dark', remembered per computer
function hubGetTheme() { try { var v = window.localStorage.getItem(HUB_THEME_KEY) || window.localStorage.getItem('itp_theme_v1'); return v === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
function hubSetTheme(t) { try { window.localStorage.setItem(HUB_THEME_KEY, t === 'dark' ? 'dark' : 'light'); } catch (e) {} }
var HUB_COLORS = {
    light: { bg: '#F1F5F9', card: '#FFFFFF', border: '#E2E8F0', text: '#1E293B', muted: '#64748B', primary: '#0072CE', primaryDark: '#00468B', accent: '#FFB81C', accentSoft: '#FFF6E0', primarySoft: '#E6F1FB' },
    dark: { bg: '#1B2740', card: '#24324D', border: '#33425F', text: '#E2E8F0', muted: '#94A3B8', primary: '#4DA3E8', primaryDark: '#B3D4F2', accent: '#FFB81C', accentSoft: '#3A3320', primarySoft: '#1E2A42' }
};
// Status colors mean one thing in every app. Red is only for overdue, a failed save and a positive swab.
var HUB_STATUS_COLORS = { done: '#059669', started: '#0072CE', planned: '#64748B', overdue: '#DC2626', atrisk: '#D97706', skipped: '#D97706' };
var HUB_BRAND_RED = '#E4002B';            // the logo only, never a status
// ---------- app manifest (self-check for the Dataverse monitor) ----------
// Each app declares the tables and columns it reads and writes (logical names only, never data) and saves that list
// once per change in craa5__0_hubconfig, key 'manifest|' + appId. The Dataverse monitor reads every manifest| row and
// checks it against Dataverse (missing tables / columns) and contract.json (owners, statuses). Contract section 12.1.
//   m = { appId: 'ganttly', app: 'Ganttly', version: '2.0.0',
//         tables: [ { t: 'craa5_cleancheckoff', names: ['craa5_cleancheckoff'], read: [cols], write: [cols], opt: [cols] } ],
//         config: ['ganttly_settings'] }
//   names = table names the app tries, in order (default [t]); opt = columns the app works without (shown as "not yet").
var HUB_APP_IDS = ['ganttly', 'shiftstart', 'prodsched', 'msscalendar', 'msslog', 'pbed', 'bolo', 'managerhub', 'chemicals', 'mapsubmit', 'monitor', 'training'];
// Shared settings table: the new _e_ Hub config first (Organization-owned, big craa5_configjson), the old _0_ one second.
// Own names: some pages already declare HUB_CONFIG_TABLE.
var HUB_CONFIG_TABLES = ['craa5__e_hubconfig', 'craa5__0_hubconfig'];
var HUB_MANIFEST_TABLE = HUB_CONFIG_TABLES[0];
function hubNameList(a, keepCase) {
    var out = [], seen = {};
    (a || []).forEach(function (x) { var v = String(x === undefined || x === null ? '' : x).trim(); if (!keepCase) v = v.toLowerCase(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
}
// The manifest as stored: fixed key order, sorted lists, so the same app build always gives the same text and hash.
// What an app needs built, declared in its manifest (ground rule 10: nothing writes Dataverse tables or columns;
// the Dataverse monitor reads, shows and tests these and Gerald builds from its prompts). Per table, all optional: cols { column: { type, len, label, options, min, max,
// precision, default } }, label (display name), new (true = a table still to make), owner ('org' or 'user'),
// primary { n, len, label }, prompt (the app's recommended Copilot prompt for the table, at most 2000 characters). type = text|memo|int|decimal|money|yesno|date|datetime|choice|guid (guid = text 100,
// never a lookup). contract.json colTypes decides; a manifest type that disagrees is shown as a conflict.
var HUB_COL_TYPES = ['text', 'memo', 'int', 'decimal', 'money', 'yesno', 'date', 'datetime', 'choice', 'guid'];
function hubNum(v) { var n = Number(v); return v === '' || v === null || v === undefined || isNaN(n) ? undefined : n; }
function hubColSpec(c) {
    c = typeof c === 'string' ? { type: c } : (c || {});
    var type = String(c.type || '').trim().toLowerCase();
    if (HUB_COL_TYPES.indexOf(type) < 0) return null;
    var o = { type: type }, k;
    var nums = { len: hubNum(c.len), min: hubNum(c.min), max: hubNum(c.max), precision: hubNum(c.precision) };
    for (k in nums) if (nums[k] !== undefined) o[k] = nums[k];
    if (c.label) o.label = String(c.label).trim();
    if (c.options && c.options.length) o.options = c.options.map(function (x) { return String(x).trim(); }).filter(function (x) { return !!x; });
    if (c['default'] !== undefined && c['default'] !== null && c['default'] !== '') o['default'] = typeof c['default'] === 'boolean' || typeof c['default'] === 'number' ? c['default'] : String(c['default']);
    return o;
}
function hubManifest(m, nowIso) {
    m = m || {};
    var tables = (m.tables || []).map(function (t) {
        var name = String(t.t || '').trim().toLowerCase();
        var out = { t: name, names: hubNameList(t.names && t.names.length ? t.names : [name]), read: hubNameList(t.read).sort(), write: hubNameList(t.write).sort(), opt: hubNameList(t.opt).sort() };
        var cols = {}, n = 0;
        Object.keys(t.cols || {}).sort().forEach(function (c) { var k = String(c).trim().toLowerCase(), v = hubColSpec(t.cols[c]); if (k && v) { cols[k] = v; n++; } });
        if (n) out.cols = cols;
        if (t.label) out.label = String(t.label).trim();
        if (t['new'] === true) out['new'] = true;
        var ow = String(t.owner || '').trim().toLowerCase();
        if (ow === 'org' || ow === 'user') out.owner = ow;
        if (t.prompt) out.prompt = String(t.prompt).trim().slice(0, 2000);
        if (t.primary && t.primary.n) { out.primary = { n: String(t.primary.n).trim().toLowerCase() }; if (hubNum(t.primary.len) !== undefined) out.primary.len = hubNum(t.primary.len); if (t.primary.label) out.primary.label = String(t.primary.label).trim(); }
        return out;
    }).filter(function (t) { return !!t.t; }).sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    var out = { m: 1, appId: hubCanon(m.appId), app: String(m.app || ''), version: String(m.version || ''), contract: HUB_CONTRACT_VERSION, tables: tables, config: hubNameList(m.config, true).sort() };   // hubconfig keys keep their case: they match exactly
    out.hash = hubIdFromKey(JSON.stringify(out)).slice(0, 8);
    out.savedAt = nowIso || new Date().toISOString();
    return out;
}
function hubManifestKey(appId) { return 'manifest|' + hubCanon(appId); }
// io = { query(table, { select, filter, top }) -> Promise of rows (or { rows }), create(table, body), update(table, id, body) }
// (Ganttly: swQuery + swWriter). Never rejects and never blocks the app: resolves 'same', 'saved' or 'failed: why'.
// Where it goes, first that reads: _e_ Hub config craa5_configjson; old _0_ hubconfig craa5_manifestjson (its
// craa5_configjson holds only 100 characters); old _0_ hubconfig craa5_configjson.
var HUB_MANIFEST_COL = 'craa5_manifestjson';
// Every hubconfig JSON value: read Manifest json first (old table), then Config json.
function hubConfigJsonOf(row) { return row ? String(row[HUB_MANIFEST_COL] || row.craa5_configjson || '') : ''; }
function hubSaveManifest(io, m) {
    try {
        var man = hubManifest(m), key = hubManifestKey(man.appId);
        if (!man.appId) return Promise.resolve('failed: no appId');
        var fail = function (e) { return 'failed: ' + String(e && e.message || e); };
        var spots = [[HUB_CONFIG_TABLES[0], 'craa5_configjson', []], [HUB_CONFIG_TABLES[1], HUB_MANIFEST_COL, ['craa5_configjson']], [HUB_CONFIG_TABLES[1], 'craa5_configjson', []]];
        var read = function (i) {
            if (i >= spots.length) return Promise.reject(new Error('no hub config table'));
            var sp = spots[i], idCol = sp[0] + 'id';
            return Promise.resolve(io.query(sp[0], { select: [idCol, sp[1]].concat(sp[2]), filter: "craa5_configkey eq '" + key + "' and statecode eq 0", top: 5 })).then(function (res) {
                var rows = res && res.rows !== undefined ? res.rows : res;
                if (!rows) throw new Error(res && res.err || 'read failed');
                return { rows: rows, table: sp[0], col: sp[1], idCol: idCol };
            }).then(null, function (e) { return i + 1 < spots.length ? read(i + 1) : Promise.reject(e); });
        };
        return read(0).then(function (r) {
            var body = { craa5_configkey: key, craa5_configname: (man.app || man.appId) + ' manifest' };
            body[r.col] = JSON.stringify(man);
            var row = r.rows[0];
            if (row) {
                var old = {}; try { old = JSON.parse(row[r.col] || '{}'); } catch (e) {}
                if (old && old.hash === man.hash) return 'same';
                return Promise.resolve(io.update(r.table, hubGuid(row[r.idCol]), body)).then(function () { return 'saved'; }, fail);
            }
            var create = {}; for (var k in body) create[k] = body[k];
            create[r.idCol] = hubIdFromKey('hubconfig|' + key);      // fixed id: two people opening at once still make one row
            return Promise.resolve(io.create(r.table, create)).then(function () { return 'saved'; }, fail);
        }, fail);
    } catch (e) { return Promise.resolve('failed: ' + String(e && e.message || e)); }
}
/* ============================== END HUB SHARED v1.3 ============================== */
