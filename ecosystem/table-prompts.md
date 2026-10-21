# Tables and columns for data contract 1.0

These are the Dataverse changes from `data-contract.md` section 13 that this thread owns. Most are a few columns added to tables you already have. There is one small new table. No lookups. Every column is optional, so nothing breaks while they are missing. Apps check for each column and use it once it is there.

Order: part 1 matters most (it fixes double logging and night shifts landing on the wrong day). Parts 2-4 can wait.

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

## Part 2. Equipment (`craa5_aa_assets`): 1 column, only if missing

Open the table's columns and search for "Midweek". If it is not there:

| Display name | Schema name | Type |
|---|---|---|
| Midweek | `craa5_midweek` | Yes/No, default No |

Then set it to **Yes** on every IBL4 piece that is in the midweek clean (everything except caseout / dry-clean items and the freezer). The MSS Calendar's frequency matrix can set it in bulk once the Calendar thread adds the column there.

## Part 3. Clean check-off (`craa5_cleancheckoff`): 4 columns

| Display name | Schema name | Type |
|---|---|---|
| Shift date | `craa5_shiftdate` | Single line of text, max 10 |
| Clean kind | `craa5_cleankind` | Single line of text, max 20 |
| Completion key | `craa5_completionkey` | Single line of text, max 200 |
| Employee guids | `craa5_employeeguids` | Multiple lines of text, max 4000 |

If the table itself does not exist yet, ask the Ganttly thread for its full prompt. These four columns will be in it.

## Part 4. New table: _e_ Labor rate (`craa5__e_laborrate`)

Power Apps > **Tables** > **New table** > **Start with Copilot**. Paste the prompt, check the names in the draft, then **Save and exit**. Choose **Organization** ownership if it asks (or under Advanced options).

(866 characters)

```text
Create one new Dataverse table. Do not add sample data and do not add columns I do not list.
Display name: _e_ Labor rate. Plural name: _e_ Labor rates. Schema name: craa5__e_laborrate. Record ownership: Organization.
Primary column: Name (craa5_name), single line of text, maximum 100 characters.
Description: Hourly labor rates used for sanitation cost recaps. One row per role per date the rate starts.
No lookup, choice, relationship, autonumber or formula columns: use only the types given. A column's display name without spaces, in lower case, must equal the part after craa5_.
Columns, all optional:
Role (craa5_role) single line of text, maximum 50 characters
Hourly rate (craa5_hourlyrate) currency
Effective from (craa5_effectivefrom) date only
Notes (craa5_notes) multiple lines of text, maximum 2000 characters
Keep the column names exactly as written.
```

What goes in it: one row per role, e.g. Name "Sanitor 2026", Role `Sanitor`, Hourly rate, Effective from `2026-01-01`. Use Role `All` for a single plant-wide rate. When a rate changes, add a new row with the new date. Do not edit the old one, so past weeks keep their cost. Apps use the newest row whose Effective from is on or before the shift date.

## Part 5. Map observations (`craa5__facilityobservation`): 2 columns

For the Map submission tool. It writes them only once they exist.

| Display name | Schema name | Type |
|---|---|---|
| Equipment guids | `craa5_equipmentguids` | Multiple lines of text, max 4000 |
| MSS area guid | `craa5_mssareaguid` | Single line of text, max 100 |
