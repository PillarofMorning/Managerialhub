# Clean Plan reader guide (craa5_cleanplan)

Written by the Production Scheduler ("hub - production schedule" v4.1). No other app writes this table. Ganttly, Shift Start, the MSS Calendar, PBED and the Manager hub only read it. This guide wins over section 6.5 of the data contract on any detail.

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

**When a week is safe to read.** Every week has a `k|Monday` row. Use the week's windows, days and alerts only when that row's `craa5_status` is `done`. While it says `writing`, a publish is still in progress. If no week row exists, the week has not been published yet, so fall back to your own rule and say so on screen.

The row id (`craa5_cleanplanid`) never changes for a given plan key, so it is safe to store.

## 2. Window rows (one stop of a line)

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
  maint: [[start, end], ...], area, line, areaId }
```

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

Readers do not need this column. Its effect is already in the windows and alerts. Until the column exists, the Scheduler keeps overrides in that browser only, and Data Check > Columns lists the column as missing.

## 6. Day rows and the config row

These have not changed from v4.0. Day rows: `craa5_cleankind` is `due`, `stretch`, `covered`, `none` or `unplanned`, and `craa5_status` is `ran`, `idle` or `unplanned`. Their details are `{v, prod, len, kind, weekOn, planned, job, lines, areaId}`. The config row holds the shared cleaning settings, which now include the skip words per area (`skipMidweek`, `skipDaily`).

## 7. Clean rules this plan follows (v4.1, rules stamp `...|mw72last|scope1`)

- **IBL4:** at most 72 run hours. The midweek clean goes in the last stop before the 72 h mark that is long enough. If none is long enough, it goes in the longest stop before the mark. If there is no stop before the mark, the first stop after it gets the clean, and an `over72` alert is written. The midweek clean covers everything except caseout, dry clean and freezer pieces (skip words, editable in Cleaning Times).
- **IBL5 and waterjet:** a Daily clean every night. Pieces left out (some PIC areas) are set with the Daily skip words in Cleaning Times. Those words are still to be confirmed by Gerald.
- **Every line:** an End of Week clean when production ends for the week, usually Saturday or Sunday.
- **Highspeed and Custard:** never scheduled together (`apart` alerts). Minimal dailies, then an End of Week clean that includes the kettles, silo, sifter and dough room.
- **Dough room, silo and sifter:** start 5 h before the line by default (Gerald said 4 to 6 h). This is set per supporting area in Cleaning Times.

## 8. Copilot prompt for the new column

Paste this into the Dataverse Copilot table editor on the Production Schedule table (`craa5__aa_prd_schd`):

> Add one column to the Production Schedule table: "Clean Override", Single line of text, maximum length 200, not required, schema name craa5_cleanoverride. It holds the scheduling department's approved change to the clean after a run, as text like "skip|Name|reason" or "midweek|Name|reason". Do not make it a lookup or a choice column.

After adding it, open the Production Scheduler, go to Data Check, click Refresh Dataverse & Test All Columns, and check that "Clean Override" shows as found. The same Data Check > Columns list shows any Clean Plan column that is still missing.
