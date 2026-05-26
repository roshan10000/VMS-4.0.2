# SHEET_FORMAT — column reference for every tab

The backend bootstraps these tabs automatically on first access. You don't
need to create them manually, but this document is the source of truth if
you ever need to edit rows by hand or migrate data.

All three tabs live in the spreadsheet whose ID is set as `SHEET_ID` in
Script Properties.

---

## Tab: `Users`

| # | Column         | Type   | Notes |
|---|----------------|--------|-------|
| 1 | `Username`     | string | Lower-case recommended. Unique. Login key. |
| 2 | `PasswordHash` | string | `SHA-256(password + 'vms.v1')`, hex. Never store plaintext. |
| 3 | `Role`         | string | `Admin` or `User`. Case-sensitive. |
| 4 | `Status`       | string | `Active` or `Disabled`. Disabled users can't log in. |
| 5 | `CreatedAt`    | ISO    | Set on row insert. Informational. |

### Examples

```
Username | PasswordHash                                | Role  | Status   | CreatedAt
admin    | 6f0a6db5...                                 | Admin | Active   | 2026-05-26T08:30:00.000Z
op-suri  | bc14a921...                                 | User  | Active   | 2026-05-26T09:15:00.000Z
op-leah  | 89ed5b4a...                                 | User  | Disabled | 2026-04-12T...
```

### Manual operations

- **Disable a user fast**: change `Status` from `Active` → `Disabled`. The
  next login attempt is rejected.
- **Reset a password without using the UI**: compute the hash yourself —
  Apps Script editor → run a one-off:
  ```js
  function setPwd() {
    Logger.log(Auth_hash('newPassword'));
  }
  ```
  Paste the result into the `PasswordHash` cell.

---

## Tab: `Logs`

Twenty-one columns, one row per uploaded video.

| #  | Column         | Type   | Source / notes |
|----|----------------|--------|----------------|
| 1  | `Date`         | string | `YYYY-MM-DD`, script timezone |
| 2  | `Time`         | string | `hh:mm a` (e.g. `04:55 PM`) |
| 3  | `User`         | string | Authenticated username (from session token) |
| 4  | `OrderType`    | string | `Forward` · `Return` · `D2C` |
| 5  | `Marketplace`  | string | From the recording form |
| 6  | `OrderId`      | string | Order or Return ID from the form |
| 7  | `Courier`      | string | Courier / logistics partner |
| 8  | `Warehouse`    | string | Warehouse location |
| 9  | `Operator`     | string | Operator name (may differ from `User`) |
| 10 | `ReturnReason` | string | Returns only — empty for Forward/D2C |
| 11 | `CustomerName` | string | D2C only |
| 12 | `ShipmentType` | string | D2C only |
| 13 | `BrandName`    | string | D2C only |
| 14 | `Remarks`      | string | Free-text remarks |
| 15 | `FileName`     | string | e.g. `AMAZON_123456_2026-05-26_04-55PM.webm` |
| 16 | `DriveUrl`     | string | Direct Drive viewer URL |
| 17 | `DriveFileId`  | string | Used for delete + ownership |
| 18 | `Duration`     | string | `mm:ss` |
| 19 | `SizeBytes`    | number | File size, used for storage stats |
| 20 | `UploadStatus` | string | `OK` on success. Failed uploads never write a row. |
| 21 | `CreatedAtIso` | ISO    | Authoritative timestamp for retention math |

### Notes on retention

The daily cleanup compares `CreatedAtIso` to the cutoff. If you ever import
historical data via copy-paste, fill that column with valid ISO timestamps
or those rows will never expire (the code is intentionally conservative —
rows it can't parse are kept).

### Note on `SizeBytes`

The dashboard's "Storage used" card sums this column. The Admin → Storage
card walks Drive directly. Small mismatches (a few MB) are normal — Drive
counts metadata, the Sheet only counts what the uploader reported.

---

## Tab: `Settings`

Two-column key/value store for runtime settings the admin wants to change
without redeploying the script. Currently unused by the shipped UI but
reserved for forward compatibility.

| # | Column  | Type   |
|---|---------|--------|
| 1 | `Key`   | string |
| 2 | `Value` | string |

You can use it freely; the backend doesn't currently read from this tab.

---

## Suggested manual edits — when to do them

| Goal | Edit |
|------|------|
| Lock out a user immediately | `Users.Status` → `Disabled` |
| Wipe one log entry (and its Drive file) | Delete the Drive file by ID, then delete the sheet row |
| Promote a user to admin | `Users.Role` → `Admin` |
| Migrate to a new spreadsheet | Copy all three tabs, update `SHEET_ID` script property |

> ⚠️ **Don't reorder columns.** The backend looks columns up by header name
> (defensively), so renaming a column will silently break that column's read
> path. Insert new columns to the **right** of the existing ones if you need
> custom fields.
