# Tables and columns for data contract 1.0

**You do not create the data contract itself.** `data-contract.md` is the rulebook the apps follow; it is not a table. This file is the only part you build in Dataverse.

These are the Dataverse changes from `data-contract.md` section 13 that this thread owns. Most are a few columns added to tables you already have. There is one small new table. No lookups. Every column is optional, so nothing breaks while they are missing. Apps check for each column and use it once it is there.

Order: part 1 matters most (it fixes double logging and night shifts landing on the wrong day). The rest can wait. Copilot cannot edit an existing table, so parts 1, 3 and 5 are done by hand.

How to add a column by hand: Power Apps maker > **Tables** > the table > **New** > **Column**. Type the **Display name** exactly as written. Dataverse makes the schema name from it (shown in brackets: check it before saving). Leave **Required** = Optional. Save. When all are in, open the Dataverse monitor and run its check.

---

## Part 1. MSS log (`craa5__log_`, display name "_log_"): 11 columns

| Display name | Schema name it must get | Type |
|---|---|---|
| Completion key | `craa5_completionkey` | Single line of text, max 200 |
| Shift date | `craa5_shiftdate` | Single line of text, max 10 |
| Shift code | `craa5_shiftcode` | Single line of text, max 5 |
| Clean kind | `craa5_cleankind` | Single line of text, max 20 |
| Labor minutes | `craa5_laborminutes` | Whole number |
| Employee guids | `craa5_employeeguids` | Multiple lines of text, max 4000 |
| Marked by | `craa5_markedby` | Single line of text, max 200 |
| Source | `craa5_source` | Single line of text, max 50 |
| Done at | `craa5_doneat` | Date and time (date and time, not date only) |
| Plan key | `craa5_plankey` | Single line of text, max 200 |
| Line key | `craa5_linekey` | Single line of text, max 50 |

Optional extra, worth doing once the apps fill Completion key: table > **Keys** > **New key**, display name "Completion key", column Completion key. Dataverse then refuses a second row with the same key, even from an old app.

Security: `_log_` is User-owned. Every hub role needs **Organization** level Read (and Create/Write for roles that log). Otherwise each person sees only their own rows.

## Part 2. Equipment (`craa5_aa_assets`): nothing to add

The Midweek column (`craa5_midweek`) already exists. Set it to **Yes** on every IBL4 piece in the midweek clean (everything except caseout / dry-clean items and the freezer). The MSS Calendar's frequency matrix can do it in bulk.

## Part 3. Clean check-off (`craa5_cleancheckoff`): 4 columns

| Display name | Schema name | Type |
|---|---|---|
| Shift date | `craa5_shiftdate` | Single line of text, max 10 |
| Clean kind | `craa5_cleankind` | Single line of text, max 20 |
| Completion key | `craa5_completionkey` | Single line of text, max 200 |
| Employee guids | `craa5_employeeguids` | Multiple lines of text, max 4000 |

If the table itself does not exist yet, ask the Ganttly thread for its full prompt. These four columns will be in it.

## Part 4. New table: _e_ Labor rate (`craa5__e_laborrate`) (done 2026-10-23)

Copilot makes one table per prompt and does best with short ones. Power Apps > **Tables** > **New table** > **Start with Copilot**, paste, check the names, **Save and exit**. Choose **Organization** ownership if it asks.

```text
Create table "_e_ Labor rate", schema name craa5__e_laborrate, Organization owned, no sample data, no lookups.
Primary column: Name (text).
Columns: Role (text, 50), Hourly rate (currency), Effective from (date only), Notes (multiline text).
```

If a column comes out with another name, rename its display name or add it by hand (New > Column).

What goes in it: one row per pay role. Role must be spelled the same as the employee's `craa5_roleid` (case does not matter): `sanitation tech 1`, `sanitation tech 2`, `sanitation tech 3`, `Adm`, `Int`. Anyone with no pay role, or a role with no row, is costed at `sanitation tech 2`, and planned cost always uses `sanitation tech 2`. When a rate changes, add a new row with the new date. Do not edit the old one, so past weeks keep their cost. Apps use the newest row whose Effective from is on or before the shift date.

## Part 5. Map observations (`craa5__facilityobservation`): 2 columns

For the Map submission tool. It writes them only once they exist.

| Display name | Schema name | Type |
|---|---|---|
| Equipment guids | `craa5_equipmentguids` | Multiple lines of text, max 4000 |
| MSS area guid | `craa5_mssareaguid` | Single line of text, max 100 |

## Part 6. Shared settings (`craa5__0_hubconfig`): maybe one column

**Done 2026-10-21:** Gerald added Manifest json (`craa5_manifestjson`). Config json turned out to hold only 100 characters, so all apps now keep their settings in Manifest json too. Only step 3 (roles) remains if not done yet.

Apps now save a short list of the tables and columns they use here, so the Dataverse monitor can check every app by itself (contract section 12.1). The lists are up to about 8 KB. Do **not** recreate this table: seven apps keep their settings in it. Its Config json column cannot be resized or deleted (the "dependencies" are just the form and views that show it), and that is fine.

1. Tables > hubconfig > Columns > **Config json** > Advanced options: read **Maximum character count**. If it is 10,000 or more, stop here.
2. Otherwise add one column to hubconfig (New > Column):

| Display name | Schema name | Type |
|---|---|---|
| Manifest json | `craa5_manifestjson` | Multiple lines of text, Maximum character count **100000** (set it while creating) |

3. Security roles: every hub role needs **Organization** Read on hubconfig, and **Organization** Write too, so a newer app version can update a list someone else saved.

Apps use Manifest json when it is there and Config json when it is not, so nothing breaks either way.

## Part 7. Equipment (`craa5_aa_assets`): 2 more columns for egg and pecan allergen cleans

Egg and pecan cleans cover different pieces and take different times. **Done 2026-10-21:** the flags Egg allergen (`craa5_eggallergen`) and Pecan allergen (`craa5_pecanallergen`). Still to add by hand (New > Column):

| Display name | Schema name | Type |
|---|---|---|
| Egg clean minutes | `craa5_eggminutes` | Whole number |
| Pecan clean minutes | `craa5_pecanminutes` | Whole number |

Minutes are labor minutes (people x minutes), the same way as the Allergen clean mins column. Leave one blank and apps use the old combined Allergen clean mins for it.

Optional: on the same table, rename the display name of the **Month** column (`craa5_month`) to "6 month". Only the display name changes; the schema name stays and nothing breaks.

## Part 8. New table: _e_ Hub config (`craa5__e_hubconfig`), replaces the old hubconfig

The old hubconfig is User-owned and its Config json holds only 100 characters, so the apps' settings could not save. The new table keeps the **same column names**, so apps only change the table name. Power Apps > **Tables** > **New table** > **Start with Copilot**, paste:

```text
Create table "_e_ Hub config", schema name craa5__e_hubconfig, Organization owned, no sample data, no lookups.
Primary column: Config name (text 200), schema craa5_configname.
Columns: Config key (text 200, schema craa5_configkey), Config json (multiple lines of text, maximum 1048576 characters, schema craa5_configjson).
```

**Still to do (monitor, 2026-10-23): the table exists but has no Config key column.** Open _e_ Hub config > **New** > **Column**: Display name `Config key`, schema name `craa5_configkey`, Single line of text, max 200. Until it exists, every app keeps using the old hubconfig.

Then check before adding any rows:
1. The three schema names are exactly `craa5_configname`, `craa5_configkey`, `craa5_configjson`.
2. Config json > Advanced options > Maximum character count = **1048576**. If Copilot set less, delete that column (the new table has nothing depending on it yet) and add it again by hand with 1048576.
3. Optional but good: **Keys** > New key "Config key" on Config key, so a key can never be saved twice.
4. Security roles: every hub role gets **Organization** Read, Create and Write on _e_ Hub config.

Leave the old hubconfig alone. Apps read the new table first and the old one second, so nothing breaks while both exist. Add the keys once the apps have been pasted with the new version, or let the apps create their own rows when they first save.

## Part 9. New table: _e_ Shift task (`craa5__e_shifttask`), for the Scheduler's crew plan

Mandatory work with no clean minutes (trash, admin, chemical clerk, janitorial, steam pits). Until you make it, the crew plan keeps its tasks in Hub config `PRODSCHED_CREWPLAN`, so nothing breaks while you wait. Power Apps > **Tables** > **New table** > **Start with Copilot**, paste, check the names, **Save and exit**. Choose **Organization** ownership if it asks.

```text
Create a table named "Shift task" with schema prefix craa5__e_, Organization ownership. Primary column "Name" (single line of text, 100). Columns: "Task key" craa5_taskkey (single line of text, 100, the shift and task name, for example night|trash); "Shift" craa5_shift (single line of text, 10: day, night or both); "Days" craa5_days (single line of text, 7, one digit per day Sunday to Saturday, 1 = on, for example 0111110); "Heads" craa5_heads (whole number); "Minutes" craa5_minutes (whole number, minutes per shift, blank = the whole shift); "Area" craa5_area (single line of text, 100, the MSS area name if it has one); "Active" craa5_active (yes/no, default yes); "Sort order" craa5_sortorder (whole number). No lookup or choice columns.
```

After it is made: open the Scheduler's Crew plan tab, unlock the page, press **Edit tasks**, then **Save tasks** once. The tasks are copied into the new table. Source: the Scheduler's guide, section 9 of /mnt/project-files/production-schedule/clean-plan-contract.md.

## Part 10. Security roles: who can see and save what

The monitor (2026-10-23) found that only admins can read the hub tables today, so the apps show empty screens for everyone else. Make two roles once: Power Platform admin center > your environment > **Settings** > **Users + permissions** > **Security roles** > **New role**. On each table set every privilege listed to **Organization** (the full green circle), except where it says User. Never give Delete: the apps deactivate rows instead.

- **Hub floor**: sanitors, leads and supervisors (Shift Start, Ganttly, MSS Log Input, MSS Calendar, Map tool).
- **Hub manager**: managers and you. Give managers both roles.

Also give both roles **Read** on `systemuser` (the apps read who is signed in). A table not yet made can be skipped and added when it exists.

| Table | Hub floor | Hub manager |
|---|---|---|
| `craa5_aa_mss_area` | Read, Write | Read, Write |
| `craa5_aa_assets` | Read, Write | Read, Write |
| `craa5_aa_ms_assets` | Read, Create, Write | Read, Create, Write |
| `craa5__aa_employee` | Read, Write | Read, Create, Write |
| `craa5__aa_leadershipteam` | Read | Read |
| `craa5_workshift` | Read | Read |
| `craa5_linepriority` | Read | Read, Create, Write |
| `craa5_changeover_rule` | none | Read, Create, Write |
| `craa5_skumaster` | none | Read, Create, Write |
| `craa5__e_laborrate` | none (pay stays with managers) | Read |
| `craa5__aa_prd_schd` | Read | Read, Create, Write |
| `craa5_cleanplan` | Read | Read, Create, Write |
| `craa5_schedulechange` | none | Read, Create, Write |
| `craa5_shiftboard` | Read, Create, Write | Read, Create, Write |
| `craa5_shiftplan` | Read, Create, Write | Read, Create, Write |
| `craa5_shiftarchive` | Read, Create, Write | Read, Create, Write |
| `craa5_shiftpreset` | Read, Create, Write | Read, Create, Write |
| `craa5_updatepreset` | Read, Create, Write | Read, Create, Write |
| `craa5_shiftlog` | Read, Create, Write | Read, Create, Write |
| `craa5_cleancheckoff` | Read, Create, Write | Read, Create, Write |
| `craa5__log_` | Read, Create, Write | Read, Create, Write |
| `craa5_mss_skipcode` (when made) | Read, Create, Write | Read, Create, Write |
| `craa5__m_timelosslog` (when made) | none | Read, Create, Write |
| `craa5__p_plan` | none | Read, Create, Write |
| `craa5__p_milestone` | none | Read, Create, Write |
| `craa5__p_workorder` | none | Read, Create, Write |
| `craa5__p_flocmap` | none | Read, Create, Write |
| `craa5__facilityobservation` | Read, Create, Write | Read, Create, Write |
| `craa5___maps` | Read, Create, Write | Read, Create, Write |
| `craa5_pathogenboloswabcatalog0320` | Read | Read, Create, Write |
| `craa5__b_swabresult` (when made) | Read | Read, Create, Write |
| `craa5__supervisor_todo` | none | Read, Create, Write |
| `craa5__m_formtemplate` | none | Read, Create, Write |
| `craa5__m_quicktask` (when made) | none | Read, Create, Write |
| `craa5__m_employeenote` | none | Read, Create, Write (managers only) |
| `craa5__e_hubconfig` | Read, Create, Write | Read, Create, Write |
| `craa5__sani_schedule_` | Read, Create, Write | Read, Create, Write |
| `craa5_mss_useraccesslog` (when made) | Read, Create, Write | Read, Create, Write |
| `craa5_useraccesslog` (when made) | Read, Create, Write | Read, Create, Write |
| `craa5_dailyproduction` | none | Read |
| `craa5__t_skill` (when made) | Read | Read, Create, Write |
| `craa5__t_skilllevel` (when made) | Read | Read, Create, Write |
| `craa5__t_trainingevent` (when made) | none | Read, Create, Write |
| `craa5__c_distributor` | none | Read, Create, Write |
| `craa5__c_chemical` | none | Read, Create, Write |
| `craa5__c_chemicalinventory` | none | Read, Create, Write |
| `craa5__c_cart` | none | Read, Create, Write |
| `craa5__c_cartline` | none | Read, Create, Write |
| `craa5__c_chemicalcount` | none | Read, Create, Write |
| `craa5__c_chemicalusagelog` | none | Read, Create, Write |
| `craa5__c_titrationtarget` | none | Read, Create, Write |
| `craa5__c_checklisttask` | none | Read, Create, Write |
| `craa5__c_clerkchecklist` | none | Read, Create, Write |
| `craa5__c_chemicalstandard` | none | Read |
| `craa5__c_areaalias` | none | Read, Create, Write |
| `craa5__c_chemicalalias` (when made) | none | Read, Create, Write |
| `craa5__c_sanitationbudget` (when made) | none | Read, Create, Write |
| `craa5__g_assignment` | Read, Create, Write | Read, Create, Write |
| `craa5__g_obstacle` (when made) | Read, Create, Write | Read, Create, Write |
| `craa5__g_handover` (when made) | Read, Create, Write | Read, Create, Write |
| `craa5__g_personnelnote` (when made) | Create, plus Read and Write at **User** level (own notes only) | Read, Create, Write |
| `craa5__aa_role` | Read | Read |
| `craa5__e_shifttask` (when made) | Read | Read, Create, Write |

Chemical clerks: the chemical thread keeps its own clerk checklist (usage log Create and Write). Give a clerk the Hub floor role plus that.
