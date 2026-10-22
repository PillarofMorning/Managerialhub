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

## Part 4. New table: _e_ Labor rate (`craa5__e_laborrate`)

Copilot makes one table per prompt and does best with short ones. Power Apps > **Tables** > **New table** > **Start with Copilot**, paste, check the names, **Save and exit**. Choose **Organization** ownership if it asks.

```text
Create table "_e_ Labor rate", schema name craa5__e_laborrate, Organization owned, no sample data, no lookups.
Primary column: Name (text).
Columns: Role (text, 50), Hourly rate (currency), Effective from (date only), Notes (multiline text).
```

If a column comes out with another name, rename its display name or add it by hand (New > Column).

What goes in it: one row per role, e.g. Name "Sanitor 2026", Role `Sanitor`, Hourly rate, Effective from `2026-01-01`. Use Role `All` for a single plant-wide rate. When a rate changes, add a new row with the new date. Do not edit the old one, so past weeks keep their cost. Apps use the newest row whose Effective from is on or before the shift date.

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
