# Safety Check: Immutable ID + Standard T0-T4

**Goal**: Verify if the new design (Immutable `t0`-`t4` IDs) conflicts with existing features.

## 1. Language Switching (`handleLanguageChange`)

* **Code Review**: It iterates config and checks `config.label`.
* **Logic**: `if (label === 'S') config.label = '夯'`.
* **Impact**:
  * **Safe**. It does NOT check `config.id`. Even if `id` is `t0`, the label initiates as "S" or "夯".
  * **Result**: Switching language updates the **Display Label**. The **ID** remains `t0`. Item association is preserved because `App.vue` maps by ID.
  * **Verdict**: ✅ Compatible.

## 2. Export / Import Data

* **Export**: Dumps `tiers` (with `id`) and `tierConfigs`.
* **Import**: Loads them back.
* **Scenario A: Legacy Data (ID = "S")**
  * Importing file where `id: "S"`.
  * System loads it. `App.vue` works fine (ID unique).
  * *Result*: Works as "Custom Tier".
* **Scenario B: New Data (ID = "t0")**
  * Importing file where `id: "t0"`.
  * System loads it.
  * *Result*: Works as "Standard Tier".
* **Conflict?**: No. ID is just a string key.
* **Verdict**: ✅ Safe.

## 3. Reset Settings

* **Action**: Resets `tierConfigs` to default (`t0`-`t4`).
* **Impact**:
  * Legacy tiers ("S") -> Not in default -> Moved to Unranked.
  * New tiers ("t0") -> In default -> Preserved.
* **Verdict**: ✅ Safe and logically consistent.

## 4. Drag & Drop

* **Logic**: Uses `tier.id` as the key for finding destination.
* **Impact**: It doesn't care if ID is "S" or "t0". As long as it matches the render loop, it works.
* **Verdict**: ✅ Safe.

## 5. CSS / Styling

* **Logic**: `TierRow` uses ID for generating keys/classes?
* **Check**: `TierRow` usually just needs a unique key.
* **Verdict**: ✅ Safe.

## Conclusion

The decoupling of ID and Label actually **improves** robustness for features like Language Switching (where Label changes but identity should not). The "Move to Unranked" logic provides a safety net for any migration mismatches.
