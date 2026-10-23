# Clean Plan reader guide (craa5_cleanplan)

Written by the Production Scheduler ("hub - production schedule" v4.8). No other app writes this table. Ganttly, Shift Start, the MSS Calendar, PBED and the Manager hub only read it. This guide wins over section 6.5 of the data contract on any detail.

All date-times are UTC. Read only active rows (`statecode eq 0`). The line key in `craa5_linekey` is the Scheduler's `canonLine(area, line)`, which is the same as `hubLineKey`: lowercase letters and digits only, for example `ibl4`, `highspeed1`.

## 1. Row types

| `craa5_rowtype` | `craa5_plankey` | One row per | `craa5_start` / `craa5_end` |
|---|---|---|---|
| `window` | `w|<run before id>|<run after id or "last">`, or `o|<run>|<run>` when two runs overlap | stop between two runs of a line | the line stops / the next run starts |
| `day` | `d|<area key>|YYYY-MM-DD` | MSS area and plant day | plant midnight to next midnight |
| `week` | `k|<Monday YYYY-MM-DD>` | plant week | Monday midnight to next Monday |
| `alert` | `a|over72|<line>|<run id>`, `a|noeow|<line>|<Monday>`, `a|apart|<run id>|<run id>` | thing scheduling must look at | see section 4 |
| `scope` | `s|<line>|<kind>|<part>` | clean kind of a line (split in parts) | both `2000-01-01T00:00:00Z` (outside every week) |
| `config` | `config` | (one row) | `2000-01-01T00:00:00Z` |
| `configpart` | `c|1` ... `c|n` | part of the shared settings when they are too long for one row | `2000-01-01T00:00:00Z` |
| `staff` | `f|YYYY-MM-DD|<crew>` (crew letter A-D; `day` or `night` when the shift has no crew letter; `|HH` added when a crew has two shifts starting that day) | sanitation shift, by the day it starts | the shift starts / ends |

**When a week is safe to read.** Every week has a `k|Monday` row. Use the week's windows, days and alerts only when that row's `craa5_status` is `done`. While it says `writing`, a publish is still in progress. If no week row exists, the week has not been published yet, so fall back to your own rule and say so on screen.

The row id (`craa5_cleanplanid`) never changes for a given plan key, so it is safe to store.

## 2. Window rows (one stop of a line)

**Open stops.** An open stop has a plan key ending in `|last` and `details.open` set to `read` (no run after it in the weeks read) or `unplanned` (nothing planned after it yet). It has no restart yet: its `craa5_end` is only where the plan ends, so readers must not use it as a restart time. Show "no restart planned yet" instead.

| Column | Meaning |
|---|---|
| `craa5_cleankind` | `allergen`, `weekly` (End of Week), `midweek` (the IBL4 72 h clean), `full` (a Daily clean), `changeover`, `none`. Map these with `hubCleanKind`: `full` is daily, `weekly` is EOW. |
| `craa5_minutes` | How many minutes the clean takes with the crew on shift |
| `craa5_status` | `ok`, `tight`, `short`, `overlap`, `nocrew`, `none` |
| `craa5_reason` | One plain sentence explaining the clean. Overrides, pieces left out and over-limit runs are written here too. |
| `craa5_area`, `craa5_line`, `craa5_mssareaguid` | Area as the runs spell it, the line number, and the MSS area id |

`craa5_details` is JSON with `v: 2`:

```
{ v: 2, stop, open, gapMin, idle,
  scope:   { key: "ibl4|midweek", parts: 2, hash: "...", pieces: 41, left: 6 } | null,
  run72:   { hours: 70.5, limit: 72, overBy: 0, by: "", mode: "" } | null,
  support: [ { area: "Dough Room", off: 300, start, end, ready, mins, late } ],
  prev: { id, code, item, allergen, type, crumb }, next: { ... } | null, allergen,
  need:  { basis, work, floor, manual, pieces, weekly, midweek, crumb, noDaily, sapOrder },
  crew:  { assumed, heads }, cleanStart, cleanEnd, shortMin, spareMin,
  maint: [[start, end], ...], area, line, areaId,
  pin:   { at, by } | null,                              (v4.6)
  after: { mode: "apart" | "together", line, at } | null, (v4.6)
  order: 1 }                                              (v4.6)
```

- `pin` (v4.6): scheduling pinned this clean's start. `cleanStart` already uses it, so readers only show "pinned by".
- `after` (v4.6): the clean was moved because of a linked line. `apart` means it waits for that line's clean to end at `at` (the two are never cleaned at the same time). `together` means it starts with that line's clean, as one job. `cleanStart` already includes the move.
- `order` (v4.6): this line's place in the day's clean order (1 = first). It is the Manager hub line order unless scheduling set an order for that day. Ganttly can use it to hand out cleans in order.

- `cleanStart` / `cleanEnd`: the planned clean slot inside the stop.
- `scope`: which pieces the clean covers. See section 3. It is null for changeovers and for cleans that are not worked out from equipment.
- `run72`: on 72 h lines (IBL4) only. `hours` is the run hours since the last midweek, EOW or allergen clean, up to this stop. `overBy` > 0 means the 72 h limit was passed. `mode`/`by` are filled when scheduling approved an override (section 5). Do not recompute this anywhere else.
- `support`: areas that must start early (dough room, silo, sifter: 300 minutes, i.e. 5 h, by default). `start`/`end` is their own slot, `ready` is when they must be done, `late` is true when the stop is too short for that.
- When the JSON would pass 1,900 characters, fields are dropped in this order: `maint`, `crew`, `need`, `support`. Treat a missing field as "not known", never as zero.

## 3. Scope rows (what a clean covers)

There is one set of scope rows for each line and clean kind: `allergen`, `weekly` and `full` on every line, plus `midweek` on 72 h lines. `craa5_minutes` is the total minutes of work. `craa5_reason` says how many pieces are included and how many are left out.

`craa5_details`:

```
{ v: 1, line: "ibl4", kind: "midweek", part: 1, parts: 2, hash: "...",
  cols: ["id","name","area","room","mins","heads","offsetMins","leftOutBy"],   (part 1 only)
  pieces: [ ["<craa5_aa_assetsid>", "Fryer 1", "IBL4", "Fry room", 45, 2, 0, ""], ... ] }
```

- `id` is the Equipment row id (`craa5_aa_assetsid`). Ganttly assigns people by this id, and it is not a lookup column.
- `offsetMins` > 0 marks a supporting-area piece that starts that many minutes early.
- `leftOutBy` is empty when the piece is in the clean. Otherwise it holds the skip word that took it out, for example `caseout`, `dry clean` or `freezer` on the IBL4 midweek clean. Show these pieces greyed out, so people can see what is skipped and why.

**Joining a window to its scope.** Take `details.scope.key` (for example `ibl4|midweek`) and read the rows `s|ibl4|midweek|1` up to `s|ibl4|midweek|<parts>`. Then join `pieces` in part order. If the scope rows' `hash` differs from `details.scope.hash`, the equipment list changed after the window was published. Use the scope rows, which are newer, and show "plan being updated".

## 4. Alert rows

These are for the Clean Plan tab, the Manager hub and Ganttly's banner. Never treat an alert as a clean.

| `craa5_cleankind` | Means | `craa5_start` / `craa5_end` | `craa5_status` | details |
|---|---|---|---|---|
| `over72` | IBL4 ran past 72 h before its next midweek, EOW or allergen clean | the moment the limit passed / the stop | `open`, or `approved` when scheduling recorded an override | `{hours, limit, overBy, from, stop, clean, prevId, by, why}` |
| `noeow` | a line ran in a week but had no stop for its End of Week clean | Monday / next Monday | `open` | `{week}` |
| `apart` | Highspeed and Custard are scheduled at the same time | the overlap | `open` | `{runs: [prev-style briefs], lines}` |

`craa5_minutes` is the minutes over the limit (`over72`) or the minutes of overlap (`apart`). English labels and Spanish text: "Over 72 h without a Midweek clean" / "Mas de 72 h sin limpieza de media semana", "Highspeed and Custard both scheduled" / "Highspeed y Custard programadas a la vez", "No End of Week clean this week" / "Sin limpieza de fin de semana esta semana".

## 5. The mercy override (on the run, not on the clean plan)

The new optional column `craa5_cleanoverride` is on the production run table (`craa5__aa_prd_schd`). It is set in the Run dialog, and an "Approved by" name is required. Its text is one of these:

- `midweek|<who>|<why>`: the IBL4 midweek clean goes in the stop after this run, even if the 72 h mark is later.
- `skip|<who>|<why>`: no midweek clean in the stop after this run. Scheduling approved going past 72 h. The `over72` alert then shows as `approved`, with who and why.

v4.6 adds a pinned clean start as an optional last field in plant time: `pin|<who>|<why>|2026-10-24T22:30` (a pin only), or `midweek|<who>|<why>|2026-10-24T22:30`. Readers do not need this column. Its effect is already in the windows and alerts. Until the column exists, the Scheduler keeps overrides in that browser only, and Data Check > Columns lists the column as missing.

## 6. Day rows and the config row

These have not changed from v4.0. Day rows: `craa5_cleankind` is `due`, `stretch`, `covered`, `none` or `unplanned`, and `craa5_status` is `ran`, `idle` or `unplanned`. Their details are `{v, prod, len, kind, weekOn, planned, job, lines, areaId}`. The config row holds the shared cleaning settings, which now include the skip words per area (`skipMidweek`, `skipDaily`). When the settings are longer than 1,900 characters, the config row's details are only `{v: 2, tz, at, parts, hash}`, and the settings JSON is split across the `configpart` rows `c|1` to `c|<parts>` (raw text, joined in order). Only the Scheduler reads these rows; other apps can skip both.

## 6a. Staff rows (the crew plan, v4.7)

One row per sanitation shift, written with the week it starts in (read it only when that week's `k|Monday` row says `done`, like the windows). The shifts come from Work Shifts (`craa5_workshift`, read with the MSS MANPOWER rules), and the people on a crew are the active sanitation employees whose Shift is that crew letter. When no shift hours are known, no staff rows are written.

- `craa5_day`: the shift date (the day it starts). `craa5_minutes`: all the person-minutes of the shift (line cleans + tasks + MSS pieces + whole-shift tasks).
- `craa5_status`: `ok` (enough people), `short` (needs more than the crew has) or `nocrew` (crew size not known).
- `craa5_details`: `{v: 1, rules, crew, shift: day|night, start: "HH:MM", hours, share, need, clean, fixed, onCrew, used, work: {line, tasks, mss, fixed}, atOnce, peak: {hour, heads}, over: [[fromHour, toHour, extraHeads]], mss: {jobs, overdue}, cleans, tasks: [[name, heads, minutes or null]], vac}`.
  - `need` = heads the shift needs = `clean` + `fixed`. `clean` = the work (line + tasks with minutes + MSS) / (shift minutes x `share`), or the most people the overlapping line cleans need at once (`atOnce`), whichever is more, rounded up. `fixed` = people on whole-shift tasks.
  - `used` = % of the crew's hours the work fills (null without a crew size). `over` = the hours where more people are needed than the crew has (the bottlenecks). `vac` = the vacation cover the crew plan adds per crew (a reader sizing a crew uses its busiest shift `need` + `vac`).
- MSS pieces in `work.mss`: pieces due by frequency (data contract section 7, `hubFreqDone`), outside every line's clean scope for Daily and weekly pieces, plus every monthly, quarterly, 6-month and annual piece. A long-period piece is given one week of its period, spread evenly among the weeks still to come. Overdue pieces (last period missed too) go into this week first unless the shared setting Ignore overdue is on.
- **MSS Log Input:** read these rows for its manpower panel instead of working the heads out again, so both screens show the same number.

Settings and tasks: Hub config key `PRODSCHED_CREWPLAN` holds `{v: 1, share, vacation, ignoreOverdue, tasks?, at}` (`tasks` only while the Shift task table does not exist). The tasks live in the new table `craa5__e_shifttask` once Gerald makes it (prompt in section 9). The Scheduler reads only `craa5__e_shifttask` or `craa5_e_shifttask`, never the plain `craa5_shifttask`, which is an old, unrelated table.

## 7. Clean rules this plan follows (v4.7, rules stamp `...|mw72last|scope1|dskip1|link1|pin1|night1|staff1`)

- **IBL4:** at most 72 run hours. The midweek clean goes in the last stop before the 72 h mark that is long enough. If none is long enough, it goes in the longest stop before the mark. If there is no stop before the mark, the first stop after it gets the clean, and an `over72` alert is written. The midweek clean covers everything except caseout, dry clean and freezer pieces (skip words, editable in Cleaning Times).
- **IBL5 and waterjet:** a Daily clean every night. It covers every PIC item but leaves out the floors, the shadow boards and anything on caseout (Gerald, 23 Oct). These are the default Daily skip words, editable per line in Cleaning Times; left-out pieces carry the word in `leftOutBy`.
- **Night stops:** a stop counts for the day it starts on. A line that runs days gets its Daily clean in each night stop. Before v4.6, every other night could be missed.
- **Linked lines:** IBL5 and Waterjet are never cleaned at the same time by default. When their cleans meet, the line lower in that day's clean order waits for the other to end. Scheduling can add pairs, either never at the same time or as one job, on the Clean Plan tab. These pairs are shared settings.
- **Every line:** an End of Week clean when production ends for the week, usually Saturday or Sunday.
- **Highspeed and Custard:** never scheduled together (`apart` alerts). Minimal dailies, then an End of Week clean that includes the kettles, silo, sifter and dough room.
- **Dough room, silo and sifter:** start 5 h before the line by default (Gerald said 4 to 6 h). This is set per supporting area in Cleaning Times.

## 8. Tables and columns this page needs (v4.8)

Apps no longer make or change Dataverse tables (data contract 1.0.60, ground rule 10). The Production Scheduler saves the tables and columns it uses, with each column's type, to Hub config as `manifest|prodsched` every time it opens. The **Dataverse monitor** reads that list and builds the prompts and click-steps for anything missing. The prompts that used to be here now come from the monitor, and [table-prompts.md](/mnt/project-files/ecosystem-contract/table-prompts.md) stays the reference until the monitor shows the same.

Still to make, from that list:

- `craa5_cleanoverride` on the Production Schedule table (`craa5__aa_prd_schd`): text, 200, label "Clean Override". It holds the scheduling department's approved change to the clean after a run (section 5).
- `_e_ Shift task` (`craa5__e_shifttask`): its column types are in [contract.json](/mnt/project-files/ecosystem-contract/contract.json). The Sanitation director becomes its writer (ground rule 11). Until it exists the Crew plan keeps its tasks in Hub config `PRODSCHED_CREWPLAN`.
- `Schedule Change` (`craa5_schedulechange`), only if the email inbox for change requests is wanted.

After the monitor has added one, open the Production Scheduler, go to Data Check > Tables and columns, press Refresh Dataverse & Test All Columns, and check it shows as found.

## 9. Heads per shift move to the Sanitation director

Headcount planning lives only in the Sanitation director (ground rule 11). The Scheduler keeps publishing the clean plan: windows, scopes, alerts, day and week rows. It keeps writing `staff` rows (section 6a) only until the director shows heads needed per shift. Then the Crew plan tab and the staff rows come out of the Scheduler, and readers such as MSS Log Input read the director's number instead.
