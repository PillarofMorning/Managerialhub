/* ============================== START MSS LOG WRITE v1.3 ============================== */
// The one place in the ecosystem that builds and saves a finished clean in the MSS log (craa5__log_), by the rule in the data
// contract, section 6.3. Paste it unchanged into every app that logs a clean (Ganttly, MSS Log Input, MSS Calendar), right after
// the HUB SHARED block (1.1 or later), which it needs (hubGuid, hubShiftDate, hubCompletionKey, hubLogIdOf, hubCleanKind, hubCrew, ...).
// 7-bit ASCII and ES5 apart from async/await (every host compiles that). Change it only with the contract (6.2 and 6.3) and bump MLW_VERSION.
//
//   - One row = one piece of equipment, one clean, one shift date, saved only when someone marked that piece done (or typed it in).
//   - No equipment id, no row: craa5_equipmentguid = craa5_aa_assetsid.
//   - The day is the SHIFT date (the plant day the shift started, on the plant clock), never the clock day it was marked.
//   - craa5_completionkey = equipment | shift date | kind, and the row id is fixed from it (hubLogIdOf), so a retry or a second
//     device updates the same row instead of adding one. Before saving, that row is read: there and active = already logged.
//   - The flags (craa5_daily / weekly / monthly) come from the kind of clean done (contract 6.2), never from the piece's highest
//     frequency. Midweek = daily only; EOW = daily + weekly; monthly and longer = all three; other = none.
//   - People: craa5_lastcleanedby = names joined with " / ", never "Crew" or a placeholder such as "X" (v1.3: a name has at least
//     two letters); craa5_employeeguids; craa5_markedby = who pressed Done.
//   - craa5_laborminutes = person-minutes; craa5_hoursworked = round(minutes / 60) for older pages.
//   - craa5_pathogen = Yes or No, never blank. craa5_source = Ganttly, Log input, Calendar or Import.
//   - craa5_allergenclean: sent as text 'Yes'; when the column is Yes/No (two options) instead, true is sent (v1.3); any other
//     type only drops that column. The check (mlwCheckRow) also flags more than 24 labor hours on one piece (v1.3).
//   - A failed save waits in this browser's queue (mlwQueue) and is tried again (mlwRetryQueue). It is never dropped or marked sent.
//   - Undo (mlwUndo) deactivates the row (statecode 1); it never deletes it.
// The new columns are optional: a column the table does not have yet is left out (remembered for the page session).
// The host passes an api with query(table, { select, filter, top }) -> rows, create(table, body) and update(table, id, body);
// mlwApi(xrm, dataApi) builds one from Xrm.WebApi or the page's dataApi.

var MLW_VERSION = '1.3';
var MLW_TABLE = 'craa5__log_';
var MLW_ID = 'craa5__log_id';
var MLW_QUEUE_KEY = 'mss_log_write_queue_v1';
var MLW_SOURCES = ['Ganttly', 'Log input', 'Calendar', 'Import'];
// Optional columns (data contract 13, part 1, plus the allergen flag). Left out of a save while the table does not have them.
var MLW_OPTIONAL = ['craa5_completionkey', 'craa5_shiftdate', 'craa5_shiftcode', 'craa5_cleankind', 'craa5_laborminutes', 'craa5_employeeguids',
    'craa5_markedby', 'craa5_source', 'craa5_doneat', 'craa5_plankey', 'craa5_linekey', 'craa5_sapw', 'craa5_allergenclean'];
// Contract 6.2: kind -> flags (D daily, W weekly, M monthly), and the English label (Spanish from HUB_ES)
var MLW_KINDS = {
    daily: { d: 1, w: 0, m: 0, en: 'Daily' },
    midweek: { d: 1, w: 0, m: 0, en: 'Midweek 72h' },
    eow: { d: 1, w: 1, m: 0, en: 'End of week' },
    allergen: { d: 1, w: 0, m: 0, en: 'Allergen' },
    egg: { d: 1, w: 0, m: 0, en: 'Egg allergen' },
    pecan: { d: 1, w: 0, m: 0, en: 'Pecan allergen' },
    changeover: { d: 1, w: 0, m: 0, en: 'Changeover' },
    monthly: { d: 1, w: 1, m: 1, en: 'Monthly' },
    quarterly: { d: 1, w: 1, m: 1, en: 'Quarterly' },
    semiannual: { d: 1, w: 1, m: 1, en: 'Semiannual' },
    annual: { d: 1, w: 1, m: 1, en: 'Annual' },
    corrective: { d: 1, w: 0, m: 0, en: 'Corrective' },
    other: { d: 0, w: 0, m: 0, en: 'Other' }
};
// Words for the codes the block returns. Spanish in % codes (hubDecodeEs).
var MLW_TEXT = {
    saved: ['Saved to the MSS log.', 'Guardado en el registro MSS.'],
    already: ['Already in the MSS log for this shift.', 'Ya est%a en el registro MSS de este turno.'],
    queued: ['Not saved yet. It will be tried again.', 'A%un no se guarda. Se intentar%a de nuevo.'],
    undone: ['Taken off the MSS log.', 'Quitado del registro MSS.'],
    no_equipment: ['No equipment ID. Pick the equipment first.', 'Sin ID de equipo. Elija el equipo primero.'],
    bad_equipment: ['The equipment ID is not valid.', 'El ID de equipo no es v%alido.'],
    no_kind: ['Which clean was this? (daily, midweek, end of week ...)', '%?Qu%e limpieza fue? (diaria, media semana, fin de semana ...)'],
    old_shared: ['This app has an old HUB SHARED block. Paste HUB SHARED 1.1 or later.', 'Esta app tiene un bloque HUB SHARED viejo. Pegue HUB SHARED 1.1 o posterior.'],
    no_day: ['No shift date.', 'Falta la fecha del turno.'],
    future_day: ['The date is in the future.', 'La fecha es futura.'],
    no_names: ['Who cleaned it? Add at least one name.', '%?Qui%en lo limpi%o? Agregue al menos un nombre.'],
    crew_name: ['"Crew" is not a name. Add who cleaned it.', '"Crew" no es un nombre. Agregue qui%en lo limpi%o.'],
    not_a_name: ['A name like "X" is not a name. Add who cleaned it.', 'Algo como "X" no es un nombre. Agregue qui%en lo limpi%o.'],
    hours_high: ['More than 24 labor hours on one piece. Often the whole order\'s time was put on every piece. Check the hours.', 'M%as de 24 horas de trabajo en una pieza. Muchas veces se puso el tiempo de toda la orden en cada pieza. Revise las horas.'],
    bad_minutes: ['Minutes must be a number from 0 to 1440.', 'Los minutos deben ser un n%umero de 0 a 1440.'],
    long_minutes: ['Over 8 hours on one piece. Check the time.', 'M%as de 8 horas en una pieza. Revise el tiempo.'],
    bad_source: ['Unknown app name for the log.', 'Nombre de app desconocido para el registro.'],
    no_pathogen: ['Pathogen is empty (should be Yes or No).', 'Pat%ogeno vac%io (debe ser S%i o No).'],
    duplicate: ['Same clean saved twice for this day.', 'La misma limpieza se guard%o dos veces este d%ia.']
};
function mlwSay(code, lang) { var t = MLW_TEXT[code]; return t ? ((lang || hubGetLang()) === 'es' ? hubDecodeEs(t[1]) : t[0]) : String(code || ''); }
function mlwKindLabel(kind, lang) { var k = MLW_KINDS[mlwKind(kind)]; return k ? hubT(k.en, lang) : ''; }

// Any way an app spells a clean -> a contract kind (hubCleanKind's list), or '' when it cannot tell
function mlwKind(raw) {
    var k = hubCleanKind(raw);
    if (k) return k;
    var s = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase().replace(/^auto\s*-\s*/, '').replace(/[\s_]+/g, '');
    if (!s) return '';
    k = hubCleanKind(s);
    if (k) return k;
    if (/^(d|day|dailyclean|shift|sh|pershift|nightly)$/.test(s)) return 'daily';
    if (/^(mw|mid|mid-week|midweekclean|midweek72h|72h)$/.test(s)) return 'midweek';
    if (/^(eow|endofweek|end-of-week|weekend|fullclean|w|wk|week|weeklyclean|bw|2w|2-week|2week|bi-weekly|biweekly|biweek)$/.test(s)) return 'eow';
    if (/^(m|mo|month|monthlyclean|2m|2-month|2month|bm|bimonthly|4m|4-month|4month|deep|deepclean|deep-clean|project)$/.test(s)) return 'monthly';
    if (/^(q|qtr|quarter|3m)$/.test(s)) return 'quarterly';
    if (/^(6m|6-month|6month|sa|semi-annual)$/.test(s)) return 'semiannual';
    if (/^(a|y|yr|year|yearly|annually)$/.test(s)) return 'annual';
    if (/^(egg|eggs|eggallergen|allergenegg|eggclean|huevo|alergenohuevo)$/.test(s)) return 'egg';
    if (/^(pecan|pecans|pecanallergen|allergenpecan|pecanclean|nuez|pecana|nuezpecana|alergenonuez|alergenonuezpecana)$/.test(s)) return 'pecan';
    if (/^(allergenclean|allergenchangeover)$/.test(s)) return 'allergen';
    if (/^(pathogen|swab|reclean|re-clean)$/.test(s)) return 'corrective';
    if (/^(as-needed|asneeded|perrun|per-run)$/.test(s)) return 'other';
    return '';
}
function mlwFlags(kind) { var k = MLW_KINDS[kind] || MLW_KINDS.other; return { craa5_daily: !!k.d, craa5_weekly: !!k.w, craa5_monthly: !!k.m }; }
function mlwNames(v) {
    var list = Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(/\s*\/\s*|\s*,\s*|\s*;\s*/);
    var out = [];
    list.forEach(function (n) { var t = String(n === undefined || n === null ? '' : (n && n.name) || n).replace(/\s+/g, ' ').trim(); if (t && out.indexOf(t) === -1) out.push(t); });
    return out;
}
function mlwIsCrew(n) { return /^(crew|equipo|cuadrilla|team|grupo|n\/?a|tbd|operator|operador)$/i.test(String(n).trim()); }
// A stand-in, not a person: fewer than two letters ("X", "-", "?", "1"), or a word such as none / unknown / test / xx.
function mlwIsPlaceholder(n) { var t = String(n).trim(); return (t.match(/[A-Za-z\u00C0-\u024F]/g) || []).length < 2 || /^(none|nobody|nadie|unknown|desconocido|test|xx+|\?+)$/i.test(t); }
function mlwYes(v) { return v === true || v === 1 || /^(true|yes|si|y|1)$/i.test(String(v === undefined || v === null ? '' : v).trim()); }
function mlwDay(v) { var s = String(v || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }

// entry: { equipmentGuid, equipment, room, area, workArea (craa5_workareacode), kind, sap (real SAP order, optional),
//          shiftDate 'YYYY-MM-DD' or slotStart (the board's craa5_slotstart), crew, cleanedBy (names: array or "A / B"),
//          employeeGuids [ ], markedBy, minutes (person-minutes) or durationMins + heads, doneAt, planKey, lineKey,
//          pathogen (true when the clean closes a swab hit), source ('Ganttly' | 'Log input' | 'Calendar' | 'Import') }
// -> { ok, row, id, key, kind, day, problems: [codes that stop the save], warnings: [codes that do not] }
function mlwBuildRow(entry, now) {
    var e = entry || {}, problems = [], warnings = [];
    var rawGuid = String(e.equipmentGuid === undefined || e.equipmentGuid === null ? '' : e.equipmentGuid).trim();
    var guid = hubIsGuid(rawGuid) ? hubGuid(rawGuid) : '';
    if (!rawGuid) problems.push('no_equipment'); else if (!guid) problems.push('bad_equipment');
    var kind = mlwKind(e.kind);
    if (!kind) problems.push('no_kind');
    else if (!hubCleanKind(kind)) problems.push('old_shared');   // egg / pecan need HUB SHARED 1.1 or later
    var day = mlwDay(e.shiftDate) || (e.slotStart ? hubShiftDate(e.slotStart) : '');
    if (!day) problems.push('no_day');
    else if (day > hubAddDays(hubPlantDay(now || Date.now()), 1)) problems.push('future_day');
    var names = mlwNames(e.cleanedBy);
    if (!names.length) problems.push('no_names');
    else if (names.some(mlwIsCrew)) problems.push('crew_name');
    else if (names.some(mlwIsPlaceholder)) problems.push('not_a_name');
    var minutes = e.minutes;
    if ((minutes === undefined || minutes === null || minutes === '') && e.durationMins !== undefined) minutes = Number(e.durationMins) * Math.max(1, Number(e.heads) || 1);
    minutes = minutes === undefined || minutes === null || minutes === '' ? NaN : Number(minutes);
    if (isNaN(minutes) || minutes < 0 || minutes > 1440) problems.push('bad_minutes');
    else if (minutes > 480) warnings.push('long_minutes');
    var source = String(e.source || '').trim();
    if (MLW_SOURCES.indexOf(source) === -1) problems.push('bad_source');
    var mins = isNaN(minutes) ? 0 : Math.round(minutes);
    var key = hubCompletionKey(guid, day, kind);
    var sap = String(e.sap || '').trim();
    var row = {
        craa5_equipmentguid: guid,
        craa5_equipment: String(e.equipment || '').trim(),
        craa5_room: String(e.room || '').trim(),
        craa5_area: String(e.area || '').trim(),
        craa5_sap: sap && !/^auto\s*-/i.test(sap) ? sap.toUpperCase() : (kind ? 'auto-' + kind : ''),
        craa5_lastcleaned: hubDateOnlyUtc(day),
        craa5_lastcleanedby: names.join(' / ').slice(0, 100),
        craa5_hoursworked: Math.round(mins / 60),
        craa5_pathogen: mlwYes(e.pathogen) ? 'Yes' : 'No',
        craa5_completionkey: key,
        craa5_shiftdate: day,
        craa5_shiftcode: hubCrew(e.crew),
        craa5_cleankind: kind,
        craa5_laborminutes: mins,
        craa5_employeeguids: hubGuidList(e.employeeGuids || []),
        craa5_markedby: String(e.markedBy || '').trim().slice(0, 200),
        craa5_source: source,
        craa5_doneat: e.doneAt ? new Date(e.doneAt).toISOString() : new Date(now || Date.now()).toISOString(),
        craa5_plankey: String(e.planKey || '').trim(),
        craa5_linekey: String(e.lineKey || '').trim(),
        craa5_sapw: String(e.workArea || '').trim(),
        craa5_uid: String(e.workArea || '').trim().slice(0, 100)   // primary name: the SAP code, same as craa5_sapw (contract 6.3)
    };
    var f = mlwFlags(kind);
    row.craa5_daily = f.craa5_daily; row.craa5_weekly = f.craa5_weekly; row.craa5_monthly = f.craa5_monthly;
    if (kind === 'allergen' || kind === 'egg' || kind === 'pecan') row.craa5_allergenclean = 'Yes';   // text Yes / No like craa5_pathogen; dropped if the column is another type
    return { ok: problems.length === 0, row: row, id: hubLogIdOf(key), key: key, kind: kind, day: day, problems: problems, warnings: warnings };
}

// The kind a stored row stands for: craa5_cleankind first, then the flags; '' = none (the calendar counts such a row for every frequency)
function mlwRowKind(r) {
    var k = mlwKind(r && r.craa5_cleankind);
    if (k) return k;
    if (mlwYes(r && r.craa5_monthly)) return 'monthly';
    if (mlwYes(r && r.craa5_weekly)) return 'eow';
    if (mlwYes(r && r.craa5_daily)) return 'daily';
    return '';
}
function mlwIsSkip(r) {
    if (!r) return false;
    if (r.craa5_skipcode) return true;
    if (/^SKIPPED\s*[(:]/i.test(String(r.craa5_lastcleanedby || ''))) return true;
    return /^SKIP:/i.test(String(r.craa5_bundle || '')) || /^SKIP:/i.test(String(r.craa5_idofssop || ''));
}
// What is wrong with a row already in the log, by the same rule (for MSS Log Input's Check tab). -> codes, [] when fine
function mlwCheckRow(r, now) {
    if (mlwIsSkip(r)) return [];
    var p = [], rawGuid = String((r && r.craa5_equipmentguid) || '').trim();
    if (!rawGuid) p.push('no_equipment'); else if (!hubIsGuid(rawGuid)) p.push('bad_equipment');
    var day = mlwDay(r && r.craa5_shiftdate) || hubDayFromDateOnly(r && r.craa5_lastcleaned);
    if (!day) p.push('no_day');
    else if (day > hubAddDays(hubPlantDay(now || Date.now()), 1)) p.push('future_day');
    var names = mlwNames(r && r.craa5_lastcleanedby);
    if (!names.length) p.push('no_names'); else if (names.some(mlwIsCrew)) p.push('crew_name'); else if (names.some(mlwIsPlaceholder)) p.push('not_a_name');
    var lm = r && r.craa5_laborminutes, hw = r && r.craa5_hoursworked;
    if ((lm !== null && lm !== undefined && lm !== '' && Number(lm) > 1440) || ((lm === null || lm === undefined || lm === '') && Number(hw) > 24)) p.push('hours_high');
    if (!mlwRowKind(r)) p.push('no_kind');
    if (r && (r.craa5_pathogen === null || r.craa5_pathogen === undefined || String(r.craa5_pathogen).trim() === '')) p.push('no_pathogen');
    return p;
}

// Columns this table turned out not to have (for the page session)
var mlwMissing = {};
// craa5_allergenclean as the table takes it: text 'Yes' first, then true for a Yes/No column (found on the first refusal)
var MLW_ALLERGEN_FORMS = ['Yes', true];
var mlwAllergenForm = 0;
function mlwErrText(e) { return String((e && (e.message || e.errorMessage || (e.error && e.error.message))) || e || ''); }
function mlwIsMissingCol(msg) { return /could not find a property|undeclared property|not a valid property|invalid property|0x80060888|does not exist|isn't valid|is not valid for|cannot find property/i.test(msg); }
function mlwIsDuplicate(msg) { return /duplicate|already exists|0x80040237|matching key values/i.test(msg); }
function mlwStrip(row) {
    var o = {};
    Object.keys(row).forEach(function (k) {
        if (mlwMissing[k] || row[k] === '') return;
        o[k] = k === 'craa5_allergenclean' && mlwYes(row[k]) ? MLW_ALLERGEN_FORMS[mlwAllergenForm] : row[k];
    });
    return o;
}
// Drop the optional column an error names (or every optional column that was sent, when it names none). false = not a column
// problem. A column another save already dropped still counts (saves run side by side), so the retry goes without it.
function mlwDropFor(e, sent) {
    var msg = mlwErrText(e);
    var low = msg.toLowerCase();
    // craa5_allergenclean's type is not known yet: the next form is tried (text, then Yes/No); when none fits, only that column is dropped
    if (sent.indexOf('craa5_allergenclean') > -1 && (low.indexOf('craa5_allergenclean') > -1 || /cannot convert|edm\.|type mismatch|incompatible/.test(low))) {
        if (mlwAllergenForm < MLW_ALLERGEN_FORMS.length - 1) mlwAllergenForm++; else mlwMissing.craa5_allergenclean = true;
        return true;
    }
    if (!mlwIsMissingCol(msg)) return false;
    var named = MLW_OPTIONAL.filter(function (c) { return sent.indexOf(c) > -1 && low.indexOf(c) > -1; });
    var drop = named.length ? named : MLW_OPTIONAL.filter(function (c) { return sent.indexOf(c) > -1; });
    if (!drop.length) return false;
    drop.forEach(function (c) { mlwMissing[c] = true; });
    return true;
}
function mlwIsDenied(e) { return /privilege|permission|not authorized|access is denied|0x80040220|prvread/i.test(mlwErrText(e)); }

// ---------- retry queue (this browser only; facts are in Dataverse once saved) ----------
function mlwQueue() { try { var q = JSON.parse(window.localStorage.getItem(MLW_QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
function mlwQueueSave(q) { try { window.localStorage.setItem(MLW_QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* storage blocked: the caller still gets 'queued' */ } }
function mlwQueueCount() { return mlwQueue().length; }
function mlwEnqueue(built, e) {
    var q = mlwQueue().filter(function (x) { return x.key !== built.key; });
    q.push({ key: built.key, id: built.id, row: built.row, tries: (built.tries || 0) + 1, at: Date.now(), error: mlwErrText(e).slice(0, 300) });
    mlwQueueSave(q);
}
function mlwDequeue(key) { mlwQueueSave(mlwQueue().filter(function (x) { return x.key !== key; })); }

// The row of this completion, if any: by its fixed id, or by the completion key (a row saved where the id was not kept)
async function mlwFind(api, built) {
    var sel = [MLW_ID, 'statecode'];
    var useKey = !mlwMissing.craa5_completionkey;
    for (var i = 0; i < 3; i++) {
        var filter = MLW_ID + ' eq ' + built.id + (useKey ? " or craa5_completionkey eq '" + built.key.replace(/'/g, "''") + "'" : '');
        try {
            var rows = await api.query(MLW_TABLE, { select: sel, filter: filter, top: 5 });
            return (rows || [])[0] || null;
        } catch (e) {
            if (useKey && mlwIsMissingCol(mlwErrText(e))) { mlwMissing.craa5_completionkey = true; useKey = false; continue; }
            throw e;
        }
    }
    return null;
}
async function mlwSave(api, how, id, row) {
    for (var i = 0; i < 16; i++) {
        var body = mlwStrip(row);
        try {
            if (how === 'create') { body[MLW_ID] = id; await api.create(MLW_TABLE, body); }
            else await api.update(MLW_TABLE, id, body);
            return;
        } catch (e) {
            if (!mlwDropFor(e, Object.keys(body))) throw e;
        }
    }
    throw new Error('MSS log: too many missing columns');
}

// Save one finished piece. -> { status: 'saved' | 'already' | 'invalid' | 'queued', key, id, problems, warnings, error }
async function mlwWrite(api, entry, opts) {
    var built = mlwBuildRow(entry, opts && opts.now);
    if (!built.ok) return { status: 'invalid', key: built.key, id: built.id, problems: built.problems, warnings: built.warnings };
    return mlwSend(api, built, opts);
}
async function mlwSend(api, built, opts) {
    var out = { key: built.key, id: built.id, problems: [], warnings: built.warnings || [] };
    var fail = function (e) { mlwEnqueue(built, e); out.status = 'queued'; out.error = mlwErrText(e); return out; };
    if (!api || typeof api.create !== 'function') return fail('No Dataverse connection');
    var found = null;
    try { found = await mlwFind(api, built); }
    catch (e) { if (!mlwIsDenied(e)) return fail(e); }   // no Read rights: the fixed id still stops a second row
    try {
        if (found && Number(found.statecode || 0) === 0 && !(opts && opts.overwrite)) { mlwDequeue(built.key); out.status = 'already'; return out; }
        if (found) {
            var upd = {}; Object.keys(built.row).forEach(function (k) { upd[k] = built.row[k]; });
            upd.statecode = 0; upd.statuscode = 1;   // a clean undone and then done again comes back
            await mlwSave(api, 'update', hubGuid(found[MLW_ID]) || built.id, upd);
        } else {
            try { await mlwSave(api, 'create', built.id, built.row); }
            catch (e) {
                // Another device saved it between the read and the create: the fixed id is taken, so it is logged
                if (!mlwIsDuplicate(mlwErrText(e))) throw e;
                mlwDequeue(built.key); out.status = 'already'; return out;
            }
        }
        mlwDequeue(built.key);
        out.status = 'saved';
        return out;
    } catch (e) { return fail(e); }
}
// Try every queued save again, oldest first. -> { saved, already, left }
async function mlwRetryQueue(api) {
    var q = mlwQueue(), res = { saved: 0, already: 0, left: 0 };
    for (var i = 0; i < q.length; i++) {
        var r = await mlwSend(api, { key: q[i].key, id: q[i].id, row: q[i].row, tries: q[i].tries || 1, warnings: [] });
        if (r.status === 'saved') res.saved++; else if (r.status === 'already') res.already++;
    }
    res.left = mlwQueueCount();
    return res;
}
// Undo a Done within the shift: the row is deactivated (statecode 1), never deleted, so every device drops it.
async function mlwUndo(api, equipmentGuid, shiftDate, kind) {
    var key = hubCompletionKey(equipmentGuid, shiftDate, mlwKind(kind));
    if (!key) return { status: 'invalid', key: key };
    mlwDequeue(key);
    try { await api.update(MLW_TABLE, hubLogIdOf(key), { statecode: 1, statuscode: 2 }); return { status: 'undone', key: key }; }
    catch (e) { return { status: 'failed', key: key, error: mlwErrText(e) }; }
}

// An api for the block from Xrm.WebApi (model-driven host) or the page's dataApi (generative page host)
function mlwApi(xrm, dataApi) {
    var web = xrm && xrm.WebApi && typeof xrm.WebApi.createRecord === 'function' ? xrm.WebApi : null;
    if (web) return {
        query: async function (table, o) {
            var parts = [];
            if (o.select && o.select.length) parts.push('$select=' + o.select.join(','));
            if (o.filter) parts.push('$filter=' + o.filter.replace(/'(?:[^']|'')*'/g, function (lit) { return "'" + encodeURIComponent(lit.slice(1, -1)) + "'"; }));
            if (o.top) parts.push('$top=' + o.top);
            var res = await web.retrieveMultipleRecords(table, '?' + parts.join('&'));
            return (res && res.entities) || [];
        },
        create: function (table, body) { return web.createRecord(table, body); },
        update: function (table, id, body) { return web.updateRecord(table, id, body); }
    };
    if (dataApi && typeof dataApi.createRow === 'function') return {
        query: async function (table, o) {
            var page = await dataApi.queryTable(table, { select: o.select, filter: o.filter, pageSize: o.top || 50, top: o.top });
            return (page && page.rows) || [];
        },
        create: function (table, body) { return dataApi.createRow(table, body); },
        update: function (table, id, body) { return dataApi.updateRow(table, id, body); }
    };
    return null;
}
/* ============================== END MSS LOG WRITE v1.3 ============================== */
