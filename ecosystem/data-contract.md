# Ecosystem data contract

Version 1.0.14, 2026-10-21. Owner: the "Ecosystem data contract" thread. Every hub app builds against this file.

Files that go with it (same folder):

- `contract.json`: the same tables and keys in a form a program can read (the Dataverse monitor reads it).
- `hub-shared.js`: the helpers that build every key, date and number below. Paste the whole `HUB SHARED v1.0` block into each app, unchanged.
- `table-prompts.md`: Copilot prompts and click-steps for the new table and columns.
- `test/hub-shared.test.js`: `node ecosystem/test/hub-shared.test.js` checks the helpers (58 checks).

Changes go through this thread. An app thread that needs a new key, column, status word or number asks here first. Then the change is added to this file, `contract.json` and the change log (section 15) in one step.

---

## 1. Ground rules

1. **One writer per fact.** Each table, or each column group on a shared reference table, has one app that writes it. The other apps only read it (section 3).
2. **Facts live in Dataverse, not in the browser.** Browser storage is only for one computer's own conveniences: language, theme, a collapsed panel, a save queue waiting to retry. Anything a second computer needs to see goes in a table (section 11 lists what moves).
3. **Plain keys, no lookups.** Tables point at each other with text keys, set out in section 2. Lookup columns that already exist stay, but no app depends on them for a join.
4. **Exact column names.** An app reads the column names in this contract. It does not guess from 22 possible names. A missing column is shown as missing (section 8.6) and is never filled in from another column.
5. **Empty means empty.** When a read fails or comes back empty, the screen says so. It never shows sample, seed or remembered data as if it were real.
6. **A save is done when Dataverse says so.** Nothing is marked sent, saved or logged before the write succeeds. A failed write stays queued and is retried. Repeated writes use a fixed row id built from the row's key (`hubIdFromKey`), so a retry or a second device updates the same row and never adds a second one. Exception: the chemical hub's `_c_` tables build their fixed ids with its own `chGuidFrom` (13,519 usage rows already carry them). Only the chemical hub writes those tables, so the two id builders never meet on the same row.
7. **Plant time.** Every day, shift and week is read on the America/Chicago clock (section 5). Never use the UTC day.
8. **Every word in English and Spanish (es-MX)**, with the shared words in section 9. Apps stay 7-bit ASCII (GEMINI.md), so Spanish accents are written as % codes.

---

## 2. Shared keys

These are the keys that join the apps. When a column holds one of these keys, it has the name given here.

| Thing | The key | Where it comes from | Column name when stored elsewhere | Shown to people as |
|---|---|---|---|---|
| **Room** | Room name, e.g. `Creme`, `General`, `Bakery`, `Support`, `Warehouse` | `craa5_aa_mss_area.craa5_parentroom`, `craa5_aa_assets.craa5_roomname` | `craa5_room` | The name |
| **Area** (MSS area) | Area name exactly as in `craa5_aa_mss_area.craa5_area`, e.g. `IBL5`, `Smock Room`, `Dough Room` | `craa5_aa_mss_area` | `craa5_area` (text). Optionally also `craa5_mssareaguid` = `craa5_aa_mss_areaid` | The name |
| **Line** | Line key = `hubLineKey(area, line)`: lower-case letters and digits, line number added when above 1: `ibl4`, `ibl5`, `waterjet`, `highspeed`, `breading2` | `craa5__aa_prd_schd.craa5_area` + `craa5_line` | `craa5_linekey` | Area name + "Line n" |
| **SAP work area** | `craa5_aa_assets.craa5_workareacode`, e.g. `SSANIBL5W` | `craa5_aa_assets`, `craa5_aa_ms_assets.craa5_title` | `craa5_sapw` (as in the MSS log) | The code |
| **Equipment** (one piece) | `craa5_aa_assets.craa5_aa_assetsid` (GUID, lower case, no braces) | `craa5_aa_assets` | `craa5_equipmentguid` (one), `craa5_equipmentguids` (several, lower case, `; ` between them: sorted with `hubGuidList`, except where a column is paired position by position with a names column, as on Map observations, where the order follows the names. Read with `hubSplitGuids`.) | `craa5_equipmentidentifier`, plus `#` + `craa5_uniqueid` when a number helps (e.g. "#549") |
| **Employee** | `craa5__aa_employee.craa5__aa_employeeid` (GUID) | `craa5__aa_employee` | `craa5_employeeguid` (one), `craa5_employeeguids` (several). The old `craa5__aaemp_guid` on Task assignment means the same. | `craa5_name` turned to "First Last". Badge `craa5_badgenumber` is for badge readers later, not for joins. |
| **Signed-in user** | `systemuser` id | `Xrm.Utility.getGlobalContext().userSettings` | `craa5_markedby` (full name, text) | Full name. Matched to an employee by e-mail (`craa5__aa_employee.craa5_email`) |
| **Crew** | Letter `A`, `B`, `C` or `D` = `hubCrew(value)` | `craa5__aa_employee.craa5_shift` (1-4 or choice), `craa5_workshift.craa5_shiftcode` | `craa5_shiftcode` | "A shift" |
| **Shift** | Shift key = `shiftDate|crew`, e.g. `2026-10-20|C` (`hubShiftKey`) | The live board: `craa5_shiftboard.craa5_slotstart` + `craa5_crew` | `craa5_shiftdate` (YYYY-MM-DD) + `craa5_shiftcode` | "Tue Oct 20, C shift" |
| **Run** | `craa5__aa_prd_schd.craa5__aa_prd_schdid` | Production Scheduler | `craa5_runid` when stored elsewhere | Product + start time |
| **Clean window** | `craa5_cleanplan.craa5_plankey`, e.g. `w|<run before>|<run after>` | Production Scheduler (Clean Plan) | `craa5_plankey` | Line + clean kind + start |
| **Completion** (one clean of one piece) | Completion key = `assetGuid|shiftDate|cleanKind` (`hubCompletionKey`) | Written once to the MSS log (section 6.3) | `craa5_completionkey` | Equipment + clean kind + shift date |
| **Week** | Monday of the plant week, YYYY-MM-DD (`hubWeekKey`) | Computed | `craa5_weekkey` | "Week of Oct 19" |

Matching names: two names are the same when `hubCanon` (lower-case letters and digits only) gives the same text. A name that matches no area is shown as unmatched. It is never matched by "contains" or by nearest spelling. Old spellings ("WJ" for Waterjet, "Cook Rm") go in an alias list kept by the app that reads them. The chemical hub's `_c_ Area alias` is the model.

Renaming an area or room breaks every text key that uses it. Treat a rename as a data change that this thread plans, not as a quick edit in the form.

---

## 3. Who writes what

Status: **live** = in use; **proposed** = in this contract, not created yet; **legacy** = still read, being replaced; **abandoned** = no app may use it.
**Primary name columns:** some tables were made with a primary name column other than the one their app first planned (for example `craa5__c_chemical` uses `craa5__c_chemical_name`). Gerald keeps them as they are. Apps read the table's `PrimaryNameAttribute` from metadata, or use the name in contract.json, and never require a renamed primary column.

Ownership: User-owned tables need **Organization-level Read** on every hub security role, or people see only their own rows and the screen looks empty with no error.

### 3.1 Reference data (set up once, edited rarely)

| Table | Status | Writes it | Reads it | Notes |
|---|---|---|---|---|
| `craa5_aa_mss_area` Areas | live | Admin in the model-driven form. Shift Start writes only `craa5_clipboard` ("include in update"). | All floor apps, Scheduler, Manager hub, PBED | Key `craa5_area`. Room `craa5_parentroom`. Line setup (`craa5_numberoflines`, `craa5_supportingpart`, `craa5_supportingoffset`, `craa5_cleanoffsetmins`, `craa5_textadditions`) is read by the Scheduler and Ganttly. Map tool and BOLO should read it too, so their areas match. |
| `craa5_aa_assets` Equipment | live | Admin form. **MSS Calendar** owns the frequency flags (`craa5_dailyclean`, `craa5_midweek`, `craa5_weeklyclean`, `craa5_monthlyclean`, `craa5_month`, `craa5_quarterly`, `craa5_annually`). **Map tool** owns `craa5_maplocation` and the pictures. | Everyone | Key = GUID. `craa5_hoursrequired` = **standard labor minutes** (section 7). `craa5_heads` = people the piece needs. `craa5_subcategory` = clean step order ("1 - pic", "5 Staging"). `craa5_midweek` exists (Dataverse monitor, 2026-10-21). |
| `craa5_aa_ms_assets` MSS SAP catalog | live | Admin / MSS Log Input | MSS Log Input, MSS Calendar, Scheduler | SAP code `craa5_title`. `craa5_hourstoclean` is read as minutes (open question Q3). |
| `craa5__aa_employee` Employees | live | Manager hub (People page) and admin. **Ganttly** writes only `craa5_remarks` / `craa5_remarkcategory` (high fives). | Everyone | Leavers: `statecode` = inactive, never a browser list. Role `craa5_role`: 256000000 Sanitor, 256000001 Lead, 256000002 Supervisor. |
| `craa5__aa_leadershipteam` | live | Admin | Shift Start | Lead/supervisor team names |
| `craa5_workshift` Shift hours | live | Admin | Shift Start, Ganttly, Scheduler, Manager hub | Crew letter + weekday + start/end hour |
| `craa5_linepriority` | live | Manager hub, Scheduler | Ganttly | |
| `craa5_changeover_rule` Run rules | live | **Production Scheduler** | PBED | The clean rules per line (section 6.1) live here and nowhere else |
| `craa5_skumaster` | live | Production Scheduler | Production Scheduler | |
| `_e_ Labor rate` | **proposed** | Manager hub (admin) | Manager hub, PBED, Ganttly People, director views | The only place a labor rate lives (section 7) |

### 3.2 The daily flow (one owner per step)

| Step | Table | Status | Writes it | Reads it |
|---|---|---|---|---|
| 1. Runs (week+) | `craa5__aa_prd_schd` | live | **Production Scheduler** only | Ganttly, Shift Start, MSS Calendar, PBED, Manager hub |
| 1b. Clean plan | `craa5_cleanplan` (Org-owned) | live | **Production Scheduler** only | Ganttly, Shift Start, MSS Calendar, PBED, Manager hub |
| 1c. Schedule change requests | `craa5_schedulechange` | live | Production Scheduler | Production Scheduler |
| 2. Crew board, live shift | `craa5_shiftboard` | live | **Shift Start** writes `craa5_boardjson` and the board columns. **Ganttly** writes only `craa5_updatesjson`. | Ganttly, Manager hub, PBED |
| 2b. Next shift setup | `craa5_shiftplan` | live | Shift Start | Shift Start, Ganttly, PBED |
| 2c. Past shifts | `craa5_shiftarchive` | live | Shift Start (when a shift is closed) | Manager hub, Ganttly, metrics |
| 2d. Saved crew setups | `craa5_shiftpreset`, `craa5_updatepreset` | live | Shift Start | Shift Start |
| 2e. Board audit trail | `craa5_shiftlog` | live | Shift Start (MSS Log Input also writes a row) | Manager hub, Dataverse monitor |
| 2f. Roster rows (old) | `craa5_taskassignment` | legacy | Shift Start | Ganttly, Manager hub (move to the board, then retire) |
| 3. Who cleans what + live progress | `craa5_cleancheckoff` | live | **Ganttly** only | Ganttly on every device, Manager hub, PBED (Execute) |
| 4. A clean finished (record of truth) | `craa5__log_` MSS log | live | **Ganttly** (piece marked Done), **MSS Log Input** (paper, SAP, by hand), **MSS Calendar** (quick log). All three use the one shared "MSS LOG WRITE" block (section 6.3). **Shift Start does not write here.** | MSS Calendar, MSS Log Input, Manager hub, PBED, Ganttly People, metrics |
| 4b. Skip codes | `craa5_mss_skipcode` | **missing** (not in Dataverse, 2026-10-21; apps treat it as optional) | MSS Log Input | MSS Calendar |
| 5. Time lost / call-outs | `craa5__m_timelosslog` | proposed (not made yet) | Manager hub, PBED (Kind = `Weekend clean`) | Manager hub, PBED |

Time loss log keeps the column names it was created with: `craa5_assetguid` holds the equipment key, `craa5_responsibleguid` the employee key and `craa5_crew` the crew letter. The contract names (`craa5_equipmentguid`, `craa5_employeeguid`, `craa5_shiftcode`) are for new tables. A reader of this table uses its own names.
| 6. Weekend plan | `craa5__p_plan`, `_p_milestone`, `_p_workorder`, `_p_flocmap` | live | PBED | PBED, Manager hub |

### 3.3 Other apps

| Table | Status | Writes it | Reads it |
|---|---|---|---|
| `craa5__facilityobservation` Map problems and pins | live | Map submission tool | Pathogen BOLO, Manager hub |
| `craa5___maps` Floor maps | live | Map submission tool | Pathogen BOLO |
| `craa5_pathogenboloswabcatalog0320` Swab sites | live | Pathogen BOLO | Pathogen BOLO, Ganttly, Map tool |
| `craa5__b_swabresult` Swab results (columns in contract.json; open hit = `craa5_result` positive and `craa5_closedkey` blank) | **proposed** (BOLO v2.2, PR #37) | Pathogen BOLO | Manager hub, Ganttly, MSS Calendar |
| `craa5__supervisor_todo` | live | Manager hub | Manager hub |
| `craa5__m_formtemplate`, `craa5__m_quicktask` (both User-owned; quick tasks are a personal list on purpose) | live | Manager hub | Manager hub |
| `craa5__m_employeenote` Manager notes on people | live | Manager hub | Manager hub, manager role only. Sensitive: User-owned, never shown to peers, never in exports or the repo. Key `craa5_employeeguid`. |
| `craa5__c_*` chemical tables (14 in contract.json, taken from the chemical hub's own spec file chemical-ordering/contract/c-tables.json, with full columns; 11 live, Chemical alias and Sanitation budget proposed, Chemical standard unknown) | live | Chemical hub | Chemical hub; Manager hub for cost. User/team-owned with Organization-level Read. The old chem log's employee, shift and equipment columns stay as text as written. |
| `craa5_dailyproduction` | live | (import) | Chemical hub, cost per pound |
| `craa5__0_hubconfig` Shared settings | live | Each app writes only its own `craa5_configkey` rows | The same app; shared keys in section 12 |
| `craa5__sani_schedule_` | live | MSS Calendar | MSS Calendar |
| `craa5_mss_useraccesslog`, `craa5_useraccesslog` | **missing** (not in Dataverse; logging is optional) | MSS apps, Shift Start | Dataverse monitor |
| `craa5__t_skill` (one row per skill; key `craa5_skillkey` = exact area name or `SYS-xxx`), `craa5__t_skilllevel` (one row per person per skill; key `craa5_levelkey` = `employeeguid|skillkey`, row id `hubIdFromKey`; level 0-3), `craa5__t_trainingevent` (append-only history) | **proposed** (Training matrix thread) | Training page only | Manager hub, Ganttly People, Shift Start Assign |
| `craa5__0_*` (asset, employee, mssarea, prodweek, saporder, shiftarchive, shiftboard, shiftlog, shiftplan) | **abandoned** | nobody | nobody (`craa5__0_hubconfig` is the one exception and stays) |
| `craa5_sanitationshiftreport` | legacy (exists, 0 rows) | nobody new | Ganttly (old read) |
| `craa5_mss_shift_capacity`, `craa5_mss_quality_verifications`, `craa5_mss_downtime_events`, `craa5_mss_cost_model`, `craa5_mss_capex_lifecycle`, `craa5_pathogen_bolo_sample`, `craa5_pathogen_bolo_harborage`, `craa5_quickload_assets` | **absent** (not in Dataverse, 2026-10-21) | nobody | Remove the code that reads them |
| 47 other craa5 tables found in Dataverse (old chemical set, old MSS tables, `craa5_table1` and others; full list in contract.json, group `unlisted`) | abandoned (3 legacy: `craa5_cart`, `craa5_distributor`, `craa5_log`, read only by old pages) | nobody | Used by no current app. Delete only when Gerald chooses. |

---

## 4. The daily flow in one paragraph

The **Production Scheduler** writes runs and publishes the clean plan. It is the only place the clean rules live, so it decides which clean happens when. **Shift Start** builds the crew board: leads, teams, who is out. The supervisor posts its status to Teams at 9, 12 and 3. **Ganttly** reads the board and the clean plan, fills in who cleans which piece, and records Start and Done per piece in the check-off table. When a piece is marked Done, Ganttly writes one MSS log row. The **MSS Calendar** shows compliance from those rows. The **Manager hub**, **PBED** and the director views compute every metric from the same rows with the definitions in section 7. Ganttly and Shift Start will later merge, and because they already share these tables, the merge is a move, not a rebuild.

---

## 5. Dates, shifts and weeks

- **Plant clock:** America/Chicago, with daylight saving (`HUB_TZ`). Every "day" in any app is a plant day, `hubPlantDay(ms)`.
- **Shift date:** the plant day the shift **started**, taken from the board's `craa5_slotstart` (`hubShiftDate`). Everything done on a night shift that starts Tuesday 18:00 belongs to Tuesday, including work after midnight. Never date work by the clock time it was marked.
- **Date-only values in Dataverse** (MSS log `craa5_lastcleaned`) hold midnight UTC of the shift date: `2026-10-20T00:00:00Z` (`hubDateOnlyUtc`). Readers take the first 10 characters (`hubDayFromDateOnly`) and never convert the time zone.
- **Text date keys** (`craa5_shiftdate`, `craa5_day`, `craa5_weekkey`) are `YYYY-MM-DD`. One existing exception: `_c_ Clerk checklist.craa5_shiftdate` is a date-only column. It stays; readers take its first 10 characters.
- **Timestamps** (started, done, saved) are stored as UTC date-times and shown on the plant clock.
- **Week:** Monday to Sunday by shift date. The week key is that Monday (`hubWeekKey`). Production usually ends Saturday or Sunday, so the EOW clean falls in the week it ends.
- **Teams status times:** 09:00, 12:00 and 15:00 plant time (Shift Start setting).

---

## 6. Cleans

### 6.1 The clean rules (set once, in the Scheduler's Run rules)

| Line | Between runs | Midweek | End of week (EOW) | Included |
|---|---|---|---|---|
| IBL4 | none | Required after **72 run hours**. Timing is the scheduling department's call. Override: `craa5__aa_prd_schd.craa5_cleanoverride` (proposed). | yes | Midweek: every piece with `craa5_midweek` = yes. Caseout / dry-clean items and the freezer are set to no. EOW: everything. |
| IBL5 | nightly | not used | yes | Nightly: every piece with `craa5_dailyclean` = yes (some PIC areas no). EOW: everything. |
| Waterjet | nightly | not used | yes | Same as IBL5 |
| Highspeed | minimal daily | not used | yes | Daily: short list (`craa5_dailyclean` = yes). EOW: everything, kettles included. Never runs at the same time as Custard. |
| Custard | minimal daily | not used | yes | Same as Highspeed |
| Dough room, silo, sifter | with Highspeed/Custard | not used | starts 4-6 h before the line's EOW | Early start comes from the area's `craa5_supportingoffset` (minutes) |

Ganttly, Shift Start and the MSS Calendar do **not** keep their own copy of these rules. They read the kind of clean from `craa5_cleanplan`.

### 6.2 Clean kinds

| Completion kind (`hubCleanKind`) | Clean Plan word (`craa5_cleankind`) | English / Spanish | MSS log flags set (`craa5_daily` / `craa5_weekly` / `craa5_monthly`) |
|---|---|---|---|
| `daily` | `full` | Daily / Diaria | daily |
| `midweek` | `midweek` | Midweek 72h / Media semana 72h | daily |
| `eow` | `weekly` | End of week (EOW) / Fin de semana (FDS) | daily + weekly |
| `allergen` | `allergen` | Allergen / Alérgeno | daily, and `craa5_allergenclean` = Yes |
| `changeover` | `changeover` | Changeover / Cambio de producto | daily |
| `monthly`, `quarterly`, `semiannual`, `annual` | (none: the MSS frequency) | Mensual, Trimestral, Semestral, Anual | daily + weekly + monthly |
| `corrective` | (none: a pathogen or inspection follow-up) | Corrective / Correctiva | daily, and `craa5_pathogen` = Yes when it closes a swab hit |
| `other` | (none) | Other / Otra | none |

Old spellings the apps still use map like this (MSS LOG WRITE v1.0, `ecosystem/mss-log-write.js` on PR #40): shift, nightly -> `daily`; weekly, biweekly, 2-week -> `eow`; 2-month, 4-month, deepclean -> `monthly`; 6-month -> `semiannual`; as-needed -> `other` (no flags).

The flags say which requirements the clean **satisfies**. They are set from the clean that was done, never from the piece's highest frequency. A daily clean on a piece that also has a monthly job does not count as monthly. The MSS log thread owns the exact flag rules in its shared block. Any change to them goes in this table first.

### 6.3 Writing a completion to the MSS log (`craa5__log_`)

One row = one piece of equipment, one clean, one shift date. The rules (from the MSS log input thread's draft, settled here):

1. **Only when a piece is marked Done** (in Ganttly, piece by piece), or entered by hand in MSS Log Input or the Calendar. An area at 100% in Shift Start is a status for the Teams post. It writes nothing to the log.
2. **No equipment id, no row.** `craa5_equipmentguid` = the asset GUID is required.
3. Row id = `hubLogIdOf(completionKey)`, and `craa5_completionkey` = `hubCompletionKey(asset, shiftDate, kind)`. Before creating, read by that key. If it exists, update it. Never rely on a per-browser "already sent" list.
4. `craa5_lastcleaned` = `hubDateOnlyUtc(shiftDate)`. `craa5_shiftdate` = shiftDate, `craa5_shiftcode` = crew.
5. `craa5_cleankind` = the kind from 6.2. The flags are set from it.
6. `craa5_sap` = the real SAP order number, or `auto-<kind>` (e.g. `auto-eow`). `craa5_sapw` = the piece's work area code. `craa5_uid` keeps its current meaning (the SAP code) and is **not** reused as a key. It is the table's primary name column, so writers should still fill it with the SAP code (the same value as `craa5_sapw`), or the row shows blank in forms and views.
7. People: `craa5_employeeguids` = every person who did it (`hubGuidList`). `craa5_lastcleanedby` = their names, "First Last", joined with ` / `, never "Crew". `craa5_markedby` = the signed-in person who pressed Done.
8. Minutes: `craa5_laborminutes` = **person-minutes** actually spent (see 7). `craa5_hoursworked` = `Math.round(laborminutes / 60)` for older readers.
9. `craa5_doneat` = when Done was pressed. `craa5_plankey` and `craa5_linekey` = the clean window it belonged to, when known.
10. `craa5_source` = `Ganttly`, `Log input`, `Calendar` or `Import`. `craa5_pathogen` = `Yes` or `No`, never blank.
11. Mark the row "sent" only after the save succeeds. Keep failed saves in the retry queue.

**Transition (until Ganttly logs piece by piece):** Shift Start may keep logging an area at 100%, only that clean's pieces, behind its switch `SHIFT_START_LOGS_MSS`, dated by `hubShiftDate`. Those rows should use the same completion key and row id as above, so Ganttly's later row for the same piece updates them instead of adding a second. The switch goes off when Ganttly's per-piece logging is live.

Undo of a Done within the same shift sets the check-off back and **deactivates** the log row (statecode 1). It does not delete it, so every device drops it too.

### 6.4 Live progress (`craa5_cleancheckoff`)

Ganttly's check-off table stays the live record of Start / Done / Undo during the shift. There is one row per check-off, updated in place, and every device reads it every 2 minutes. It holds progress; the MSS log holds the finished record. Only Ganttly writes it.

| Column | Type | Meaning |
|---|---|---|
| `craa5_checkoffkey` | text (primary) | The check-off's key: Ganttly block id + `~` + first press time (base 36 seconds). Row id = `hubIdFromKey(key)`. If a table was made with another primary column, Ganttly writes the key into `craa5_cleancheckoff1` or `craa5_name`. Readers try those in that order. |
| `craa5_status` | text | Stored values: `started`, `done`, `undone`. "Planned" means no row yet. "Overdue" is a display state (section 8.1). |
| `craa5_startedat` | date-time (UTC) | When Start was pressed. Blank if Done was pressed without Start. |
| `craa5_doneat` | date-time (UTC) | When Done was pressed. |
| `craa5_keepuntil` | date-time (UTC) | Until when the check-off still counts on screen (a monthly clean: a month). |
| `craa5_equipmentguid` | text | Asset GUID |
| `craa5_equipment` | text | Equipment name, for people |
| `craa5_area` | text | The MSS area name. Rows written before 1.0.6 may hold the room. A reader that gets no area match falls back to the asset's area. |
| `craa5_details` | multiple lines (JSON) | `{status, parentId, name, startMs, durationMins, laneKeys, workMins, heads, updatedAt, startedAt, doneAt, noStart, syncAt}`. Times are epoch ms. `workMins` = person-minutes worked. `heads` = people on it. `laneKeys` are Ganttly lanes, **not** employee ids. |
| `craa5_shiftdate`, `craa5_cleankind`, `craa5_completionkey`, `craa5_employeeguids` | text | **Proposed** (table-prompts.md part 3). The shift date, kind, completion key and the people on the piece (`hubGuidList`). Until they exist, people come from the board's `craa5_updatesjson.work[].workers[].empId`. |
| `modifiedon` | system | Last change. Use it only to order rows and to read "changed since"; never as Start or Done time. |

`craa5_shiftboard.craa5_updatesjson` (written by Ganttly): `remarks` (high fives) stays. `work` (pieces cleaned, with workers) stays for now as the board's display copy, so Shift Start and the archive show who cleaned what. It is never a source for metrics or the MSS log. It goes when the check-off people column exists and Ganttly and Shift Start merge (Ganttly Phase 5). PBED's Execute and the Manager hub read progress from the check-off table and finished pieces from the MSS log.

This replaces the "new Completion table" in the Ganttly overhaul plan: the check-off table already exists, and the MSS log, with the columns in part 1 of table-prompts.md, is the completion record. That is one fewer table to make and only one place a finished clean is counted.

### 6.5 The clean plan (`craa5_cleanplan`), as readers see it

Written only by the Production Scheduler. **The full reader guide is the Scheduler's own: `/mnt/project-files/production-schedule/clean-plan-contract.md` (code on draft PR #39). Where it and this summary differ, the guide wins.** All date-times are UTC. Readers select only active rows (`statecode eq 0`).

| Column | Meaning |
|---|---|
| `craa5_rowtype` | `window` (a stop between runs), `day` (one line, one plant day), `week` (one row per Monday), `config` (shared settings), `scope` (which pieces a line's clean kind includes), `alert` (a rule needing attention) |
| `craa5_plankey` | Window: `w|<run before id>|<run after id or "last">`, or `o|<run>|<run>` for runs that overlap. Day: `d|<line key>|YYYY-MM-DD`. Week: `k|<Monday>`. Config: `config`. Scope: `s|<line>|<kind>|<part>` (start/end 2000-01-01). Alert: `a|over72|<line>|<runId>`, `a|noeow|<line>|<Monday>`, `a|apart|<runIdA>|<runIdB>` |
| `craa5_linekey` | The line key (`hubLineKey`); day rows hold the MSS area key; week rows hold `*` |
| `craa5_start` / `craa5_end` | Window: when the line stops (end of the run before) / when the next run starts (open stops: where the plan ends). Day: plant midnight to next midnight. Week: Monday midnight to next Monday |
| `craa5_day` | The plant day, YYYY-MM-DD (window: the day the stop starts) |
| `craa5_cleankind` | Window: `allergen`, `weekly` (EOW), `midweek`, `full` (daily), `changeover`, `none` (map with `hubCleanKind`). Day: `due`, `stretch`, `covered`, `none`, `unplanned` |
| `craa5_minutes` | Window: minutes the clean takes with the crew on shift. Day: minutes of production that day |
| `craa5_status` | Window: `ok`, `tight`, `short`, `overlap`, `nocrew`, `none`. Day: `ran`, `idle`, `unplanned`. Week: `writing`, `done`. Alert: `open`, `approved` (the alert's kind is in `craa5_cleankind`) |
| `craa5_area`, `craa5_line`, `craa5_mssareaguid` | Area as the runs spell it, line number (window rows), MSS area id |
| `craa5_reason` | One plain sentence: why this clean, how long, what is short |
| `craa5_details` | JSON. Window rows: `{v, stop, open, gapMin, idle, prev, next, allergen, need: {basis, work, floor, manual, pieces, weekly, midweek, crumb, noDaily, sapOrder}, crew: {assumed, heads}, cleanStart, cleanEnd, shortMin, spareMin, maint: [[start, end]...], area, line, areaId}`, now `v: 2`, adding `scope {key, parts, hash, pieces, left}`, `run72 {hours, limit, overBy, by, mode}` and `support [{area, off, start, end, ready, mins, late}]`. Over 1,900 characters, fields drop in this order: maint, crew, need, support. `cleanStart`/`cleanEnd` are the planned clean slot inside the stop. `prev`/`next` are short run summaries. Day rows: `{v, prod, len, kind, weekOn, planned, job, lines, areaId}`. Scope rows: `{v, line, kind, part, parts, hash, cols, pieces: [[assetId, name, area, room, mins, heads, offsetMins, leftOutBy]]}`. Config row: the shared cleaning settings |
| `craa5_cleanplanname`, `craa5_name`, `craa5_contenthash`, `craa5_publishbatch` | Label for people; change fingerprint; which publish wrote it. Not for logic |

For PBED's weekend: the stop is the `window` row whose `craa5_start` falls in the weekend; restart = its `craa5_end`; the clean slot = `details.cleanStart`/`cleanEnd`; status = `craa5_status`.

---

## 7. Numbers: one definition each

Every app computes these the same way, from the same table, with the `hub-shared.js` helper named. If a screen shows a number not on this list, it must say how it was computed, in words, next to it.

| Number | Definition | From | Helper |
|---|---|---|---|
| **Standard minutes** (a piece) | `craa5_aa_assets.craa5_hoursrequired`, always **minutes of labor** (person-minutes). Blank or 0 = unknown, shown as "no standard", never guessed. No "divide by 60 if over 8". | Equipment | `hubStdMinutes` |
| **Crew minutes** (how long a clean takes on the clock) | Sum of standard minutes / people on it. People are capped by the crew on shift. | Equipment + board | |
| **Labor minutes** (actual) | Person-minutes spent on a completion: clock minutes from Start to Done x people on it, or typed in. | MSS log `craa5_laborminutes` | |
| **Hours worked** (old column) | `round(labor minutes / 60)`. Kept only for older readers. Never summed for new reports. | MSS log `craa5_hoursworked` | |
| **Completion %** (a clean, an area, a shift) | Standard minutes of pieces done / standard minutes of pieces planned x 100, over pieces that have a standard. Pieces without one are not guessed: the screen says "n pieces have no standard" and shows pieces done / planned next to the %. | Clean plan + check-offs | |
| **Pieces done** | Count of MSS log rows (active), by shift date | MSS log | |
| **Pace** (a person, a crew) | Total standard minutes / total labor minutes x 100, over the same completions. 100 = on standard. Each person gets an equal share of a completion's minutes. Last 30 shift days, at least 10 completions, or no number. | MSS log + equipment | `hubPace`, `hubShare` |
| **On-time %** | Share of completions with `craa5_doneat` before the end of their clean window (`craa5_cleanplan.craa5_end`) | MSS log + clean plan | |
| **Rework** | Done, then undone or redone in the same shift, plus pathogen / inspection hits on the piece within 7 days | Check-offs, `_b_ Swab result` | |
| **Run hours since a full clean** (IBL4 72 h) | Sum of run hours on the line since the end of its last midweek or EOW clean. Computed **only** by the Production Scheduler, published in the clean plan (`run72` in details, and `alert` rows). Others display it and do not recompute it. | Clean plan | |
| **Headcount planned / present** | Board rows assigned / board rows with attendance `present`, `late` or `loaned` | Shift board | |
| **Labor cost** | Labor minutes / 60 x the hourly rate for the person's role on the shift date (`_e_ Labor rate`). No default rate. With no rate, cost shows "no rate set". | MSS log + labor rate | `hubLaborCost` |
| **Weekly cost recap** | Labor cost summed by week key, line key and clean kind | MSS log | `hubWeekKey` |
| **Sanitation cost per pound** | (Labor cost + chemical cost for the week) / `craa5_dailyproduction.craa5_pounds` for the week. Chemical cost for the week = (drop in counts + received) between the two Sunday counts around the Monday-Sunday week, x unit price. If a count is missing, received spend is used and the number is marked so. **Draft, for Gerald to confirm.** | MSS log, chemical hub, daily production | |
| **Time lost** | Minutes in `craa5__m_timelosslog` by kind. Kind `Weekend clean` (written by PBED) is planned weekend work: shown on its own and left out of Time lost totals. | Manager hub | |

People thresholds (coaching below 75 % pace for 14 days, high performer list) are settings in `craa5__0_hubconfig` key `hub_people_thresholds`, not constants in an app. The coaching list is for supervisors and managers only, never shown to peers.

---

## 8. Status words

Stored as lower-case English codes. Shown with the label in the language chosen. Colors are in section 10.

1. **Piece / check-off** (`craa5_cleancheckoff.craa5_status`): stored `started`, `done`, `undone` (a Done taken back). Shown also: **Planned** (no row yet), **Skipped** (an MSS skip code from `craa5_mss_skipcode`), and **Overdue** (past its window end and not done). These three are display states, never stored in the check-off.
2. **Clean window** (Clean Plan `craa5_status`, Scheduler's words): `ok`, `tight`, `short`, `overlap`, `nocrew`, `none`. Shown as On track, Tight, Short of people, Overlaps a run, No crew, Nothing to do.
3. **Board** (`craa5_shiftboard.craa5_status`): `planned`, `live`, `archived`, `used`, `cancelled`.
4. **Attendance** (on a board row): `present`, `late`, `sick`, `pto`, `left_early`, `no_call`, `loaned`, `training`. Shift Start's current PTO / Sick / Late / Left Early map to these. The badge reader will later write the same words.
5. **Role** (`craa5__aa_employee.craa5_role`): Sanitor 256000000, Lead 256000001, Supervisor 256000002. Manager and Admin come from the Dataverse security role.
6. **Loading a table** (every app, same words): Loading, Ready, Nothing here yet (read worked, no rows), Table missing, No access (privilege), Could not load (network or other). An app shows one of these per table it reads. It never shows sample data instead.
7. **Swab result** (BOLO): `positive`, `negative`, `pending`. In the MSS log, `craa5_pathogen` is `Yes` / `No`.
8. **Order / cart** (chemical hub): Draft (not in SAP yet), Submitted, Approved, Ordered, Partially received, Received, Cancelled.

---

## 9. Language, words and manuals

- **One switch for all apps:** browser key `hub_lang` (`en` or `es`), read with `hubGetLang()`. On first use it picks up the old per-app keys. Every app header has the same EN / ES toggle.
- **es-MX.** Every visible word goes through the app's translate function, keyed by the English text, as in PBED's `pbT`. Each app's build check fails when a string has no Spanish.
- **ASCII only:** Spanish is written with % codes (`%a` = á, `%n` = ñ, `%?` = ¿; full list in `hub-shared.js`) and decoded at run time.
- **Shared words:** the `HUB_ES` list in `hub-shared.js`. Status words, clean kinds, attendance, roles, load states and core nouns. An app may add words but never gives a shared word another Spanish, and never reuses a shared English key with a different meaning (for example "Late" is attendance only; a late piece is "Overdue"). An app whose own list uses a shared key differently renames its key. Examples: Done = Terminado, Started = En proceso, Overdue = Atrasado, Late (attendance) = Llegó tarde, Area = Área, Line = Línea, Crew = Cuadrilla, Team = Grupo (not "Equipo", which is Equipment), Swab = Hisopo, EOW = FDS (Fin de semana). **Gerald: please have a Spanish-speaking lead check these words once (Q6).**
- **Manuals:** every screen has a `?` button that opens a one-page picture guide in the current language. It can be printed for training. At most 7 short steps, one action each ("Tap the piece. Check your name. Tap Done."), a screenshot per step, and the same layout in every app. Each app keeps its guide text in its own word list, so the Spanish check covers it.

---

## 10. Look (shared theme)

- **Theme switch:** browser key `hub_theme` (`light` / `dark`). Same toggle in every header.
- **Header:** CJ / Schwan's logo on the left (tapping it opens the admin view: setup, data check), app name, signed-in name, EN/ES, light/dark, `?`.
- **Tokens** (`HUB_COLORS` in `hub-shared.js`):

| Token | Light | Dark |
|---|---|---|
| background | `#F1F5F9` | `#1B2740` |
| card | `#FFFFFF` | `#24324D` |
| border | `#E2E8F0` | `#33425F` |
| text | `#1E293B` | `#E2E8F0` |
| muted text | `#64748B` | `#94A3B8` |
| primary (CJ blue) | `#0072CE` | `#4DA3E8` |
| primary dark (navy) | `#00468B` | `#B3D4F2` |
| accent (CJ yellow) | `#FFB81C` | `#FFB81C` |

- **Status colors** (the same in every app, `HUB_STATUS_COLORS`): done green `#059669`, started / in progress blue `#0072CE`, planned gray `#64748B`, at risk / skipped amber `#D97706`, **overdue red `#DC2626`**. Red is used only for overdue, a failed save and a positive swab. Brand red `#E4002B` is for the logo only.
- **Clean kind colors on clocks and Gantts:** daily blue, midweek amber, EOW navy, allergen purple `#7C3AED`, changeover gray. Production runs are solid slate `#475569`.
- Tap targets at least 44 px on phone screens. The same cards and chips in every app.

---

## 11. Browser storage: what moves to tables

| Browser key today | Holds | Moves to |
|---|---|---|
| `prodsched_clean_windows_v1` | Clean windows, read by Ganttly / Shift Start | `craa5_cleanplan` (Ganttly reads the table; Phase 1 of the Ganttly plan) |
| `ss_live_boards_local_v1`, `SS_DATA_CACHE_V1/V2` | Live boards, cached tables | `craa5_shiftboard`. A cache may stay as a speed-up, never as the source. |
| `ss_presets_v1` | Crew setups | `craa5_shiftpreset` |
| `ss_deactivated_employees_v1` | People who left | `craa5__aa_employee.statecode` |
| Ganttly `itp_*` keys (check-off fallback, removed / skipped tasks, obstacles, handovers, personnel notes, settings) | Floor work | Check-offs to `craa5_cleancheckoff`. Settings to `craa5__0_hubconfig` key `ganttly_settings`. Notes / handovers: Ganttly thread decides with Gerald which stay (Q7). |
| `itp_settings_v10` `avgHourlyRate` ($21) | Labor rate | `_e_ Labor rate` |
| `mss_completion_excluded_v1` | Rooms, areas and equipment left out of MSS percentages | `craa5__0_hubconfig` key `mss_completion_exclusions` (MSS Calendar) |
| `mss_line_downtime_v1` | Lines off schedule (date ranges), lines added by hand | When a line is off comes from the Clean Plan `day` rows (`craa5_status` idle / unplanned, `craa5_cleankind` none / covered). Only lines the Scheduler does not plan keep hand-entered ranges, in `craa5__0_hubconfig` key `mss_line_downtime` (MSS Calendar) |
| `mss_log_input_view_module_v1` | Log Input view rules for the Calendar | `craa5__0_hubconfig` key `mss_view_rules` |
| BOLO IndexedDB swab results + `PATHOGEN_BOLO_MANAGERS_HUB_GRAPHS` blob | Swab results | `_b_ Swab result` |
| `itp_lang_v1`, `ss_lang_v1`, `prodsched_lang_v1`, `stillwell_*_lang_v1` | Language | `hub_lang` (stays in the browser, one key) |
| `itp_theme_v1`, `schwans_theme`, `stillwell_*_dark_v1` | Theme | `hub_theme` (stays in the browser, one key) |

---

## 12. Table names, prefixes and shared settings

New tables are named `_<letter>_ Name`, so the schema name is `craa5__<letter>_name`. Columns get no prefix. Every new table is **Organization-owned**, has no lookup columns, uses Currency for money, and has a primary column named so that the display name without spaces, in lower case, equals the part after `craa5_`.

| Prefix | App | Status |
|---|---|---|
| `_c_` | Chemical hub | in use |
| `_m_` | Manager hub | in use |
| `_p_` | PBED | in use (the BOLO "_p_ swab result" idea must use `_b_` instead) |
| `_b_` | Pathogen BOLO | new |
| `_t_` | Training matrix | new |
| `_g_` | Ganttly / Shift Start (merged floor app) | reserved |
| `_e_` | Shared by the whole ecosystem (owned by this contract) | new |
| `_0_` | Abandoned set | do not use (except `craa5__0_hubconfig`) |

Apps look a table up by its prefixed name first and its plain name second, as Manager hub v6.8 does, because Gerald may create either.

**Shared settings** in `craa5__0_hubconfig` (one row per `craa5_configkey`, JSON in `craa5_configjson`, each key written by one app):
`hub_people_thresholds` (Manager hub), `ganttly_settings` (Ganttly), `mss_view_rules` (MSS Log Input), `scheduler_shared` (Production Scheduler; today its `config` row in the Clean Plan, which may stay there), `training_settings` (Training page: minimum shifts, refresher days), `mss_completion_exclusions` and `mss_line_downtime` (MSS Calendar; downtime only for lines the Scheduler does not plan).

---

## 13. New tables and columns in this version

Prompts and click-steps: `table-prompts.md`.

| What | Why | Who creates it |
|---|---|---|
| 11 optional columns on `craa5__log_` (completion key, shift date, shift code, clean kind, labor minutes, employee ids, marked by, source, done at, plan key, line key) | One honest completion record with dedup, shift date, people and minutes | Gerald, part 1 |
| `craa5_midweek` on `craa5_aa_assets` | Already exists. Gerald only sets it to Yes on IBL4 midweek pieces. | Gerald, part 2 |
| 4 optional columns on `craa5_cleancheckoff` (shift date, clean kind, completion key, employee guids) | Join live progress to the log and record who is on each piece | Gerald, part 3 |
| `_e_ Labor rate` table | The one labor rate for cost recap | Gerald, part 4 |
| `craa5_cleanoverride` text on `craa5__aa_prd_schd` | IBL4 72 h override (Scheduler thread) | Scheduler thread's prompt |
| `_b_ Swab result` | Swab results as rows (BOLO thread) | BOLO thread's prompt, keys per section 2 |
| `_t_ Skill`, `_t_ Skill level`, `_t_ Training event` | Training matrix (floor sessions are inferred from MSS log `craa5_employeeguids`) | Training thread's prompt, keys per section 2 |

Rules for other threads' new tables: area = `craa5_area` (exact area name), equipment = `craa5_equipmentguid(s)`, employee = `craa5_employeeguid(s)` plus a name column for people, dates as in section 5, Organization-owned.

### 13.1 Answers to the threads (2026-10-21)

- **MSS Calendar:** all four points accepted. Shift date (section 5), one row per piece actually done, kind from the clean done (6.2), and dedup by `craa5_completionkey`, not `craa5_uid`. Read `craa5_shiftdate` when present, else the first 10 characters of `craa5_lastcleaned`. Midweek is `craa5_cleankind` = `midweek` with the daily flag. There is no new midweek flag column on the log.
- **MSS Log Input:** your draft is the rule (6.3). Additions: `craa5_completionkey` and a fixed row id, plus `craa5_cleankind`, `craa5_shiftdate`, `craa5_shiftcode`, `craa5_employeeguids`, `craa5_doneat`, `craa5_plankey`, `craa5_linekey`. Your shared block should call `hub-shared.js` for keys and dates. You own the block. This contract owns the column list.
- **Production Scheduler:** accepted as written. You are the only writer of `craa5_cleanplan` and the line key is your `canonLine` (= `hubLineKey`). `craa5_cleanoverride` and the `alert` rowtype are added. Please keep `craa5_cleankind` words as they are. Readers map them with `hubCleanKind`.
- **Map submission tool:** `craa5__area` = exact `craa5_aa_mss_area.craa5_area`; `craa5__room` = exact room name; equipment = `craa5_equipmentguids`. Name the area id column `craa5_mssareaguid` (not `craa5_areaguid`), to match the Scheduler. The number people see is `craa5_uniqueid`. `craa5_assetcode` is empty and is not used. Please read `craa5_aa_mss_area` for the area list.
- **Pathogen BOLO:** use prefix `_b_` (`_p_` is PBED). Store `craa5_area` = the exact MSS area name. Keep your room keys (WJ, Okra/01MIX...) as an alias list that maps to area names. Store equipment as `craa5_equipmentguid`, with `craa5_uniqueid` only for display. Your OK tag can be its own text column `craa5_assettag`. Collection date is a plant day `YYYY-MM-DD`. A positive result is closed by an MSS log row with `craa5_cleankind` = `corrective` and `craa5_pathogen` = Yes on the same piece or area.
- **Dataverse monitor:** read `contract.json` (same folder). Per table it has logical name, entity set, id and name columns, prefix candidates, writers, readers, required columns, keys with what they must match, and status.

---

## 14. Open questions for Gerald

- **Q1.** Answered 2026-10-21 by the Dataverse monitor: `craa5_cleancheckoff` and `craa5_midweek` both exist.
- **Q2.** Who may mark a piece Done: leads and supervisors only, or members too? (Also asked in the Ganttly plan.)
- **Q3.** `craa5_aa_ms_assets.craa5_hourstoclean` (values like 15, 21, 1245): minutes, like Equipment?
- **Q4.** What does `craa5_month` on Equipment mean (it is set on "2nd week of month" pieces)? Is it different from `craa5_monthlyclean`?
- **Q5.** Labor rate: one rate for everyone, or by role (Sanitor, Lead, Supervisor)? The table allows both.
- **Q6.** A Spanish-speaking lead to check the shared words (section 9) once.
- **Q8.** What type is `craa5__log_.craa5_allergenclean` (Yes/No, or text like `craa5_pathogen`)? The log block sends text `Yes` and drops the column if Dataverse refuses it.
- **Q7.** Ganttly browser-only features (obstacles, handovers, personnel notes): which ones do you still use? Those move to tables. The rest go.

---

## 15. Change log

- **1.0.14 (2026-10-21)** contract.json rebuilt from the chemical thread's updated c-tables.json: the four kept `_c_` primary name columns (Chemical `craa5__c_chemical_name`, Cart line `craa5_cartlinename`, Chemical count `craa5_chemicalname`, Clerk checklist `craa5__c_clerkchecklist1`). Apps read the primary column from the table definition.
- **1.0.13 (2026-10-21)** Dataverse monitor results: check-off table and Midweek column exist; skip code and access log tables missing; time loss log and quick task not made yet; 8 named tables absent; 47 unlisted tables marked abandoned (3 legacy); primary name columns kept as made. Labor rate prompt shortened (Copilot makes one table per short prompt).
- **1.0.12 (2026-10-21)** MSS Calendar config keys `mss_completion_exclusions` and `mss_line_downtime`. Line downtime comes from the Clean Plan; hand-entered ranges only for lines the Scheduler does not plan.
- **1.0.11 (2026-10-21)** Section 6.2: old frequency spellings mapped (MSS LOG WRITE v1.0, PR #40). 6.3: fill `craa5_uid` (primary name) with the SAP code. Q8: `craa5_allergenclean` type.
- **1.0.10 (2026-10-21)** BOLO v2.2: `craa5__b_swabresult` columns and keys, and four new text columns on the swab catalog.
- **1.0.9 (2026-10-21)** Section 6.5 points to the Scheduler's reader guide; adds scope and alert rows and window details v2. `craa5_cleanoverride` ("midweek|who|why" or "skip|who|why") is for the Scheduler only.
- **1.0.8 (2026-10-21)** Section 6.5: the clean plan's columns, keys and details JSON for readers.
- **1.0.7 (2026-10-21)** contract.json takes the 14 `_c_` entries from the chemical hub's c-tables.json (columns, keys, statuses). Clerk checklist date-only shift date noted as an exception.
- **1.0.6 (2026-10-21)** Section 6.4 lists the check-off columns exactly; `updatesjson.work` is a display copy only; check-off stored statuses are started/done/undone; section 9: no reuse of a shared key with another meaning; table-prompts part 3 adds Employee guids.
- **1.0.5 (2026-10-21)** Chemical hub review: `chGuidFrom` id exception to rule 6, draft chemical cost for cost per pound, cart label "Draft (not in SAP yet)", `_c_` ownership note.
- **1.0.4 (2026-10-21)** contract.json lists the 14 `_c_` chemical tables.
- **1.0.3 (2026-10-21)** Manager hub review: time loss log keeps its column names (listed), Weekend clean left out of Time lost, quick task User-owned, `craa5__m_employeenote` added. Map: equipment id lists may follow a paired names column's order. table-prompts.md part 5 (observation columns).
- **1.0.2 (2026-10-21)** Training matrix tables added (sections 3.3, 12, 13; contract.json).
- **1.0.1 (2026-10-21)** Section 6.3: Shift Start's interim area logging (switch `SHIFT_START_LOGS_MSS`) allowed until Ganttly logs per piece, using the same completion keys.
- **1.0 (2026-10-21)** First version. Keys, owners, dates, clean kinds, MSS log write rule, number definitions, status words, language, theme, browser storage moves, prefixes, new columns and the labor rate table. The Ganttly plan's new Completion table is replaced by the existing check-off table plus new MSS log columns.
