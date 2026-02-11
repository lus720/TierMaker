# Analysis: Immutable ID Implementation (Proposal 2)

Existing logic relies on **Position-Based Mapping** (Row Index), which causes data loss/misalignment when reordering. Moving to **ID-Based Mapping** requires changes in several key areas.

## Core Challenges

### 1. `App.vue`: The "Position-Based" Logic Trap

Currently, `handleUpdateConfigs` (lines 489-554) uses `order` to map Tiers:

```typescript
// BAD LOGIC: Maps Old Order -> Tier
oldTierByOrder.set(oldConfig.order, tier)

// ... then updates Tier ID to match the new config at that position
const oldTier = oldTierByOrder.get(config.order)
if (oldTier) {
    oldTier.id = config.id // <--- This forces the Tier to adopt the identity of the "Slot"
}
```

**Impact**: This effectively says "Whatever data was in Row 1, now belongs to whatever label is in Row 1".
**Fix**: Completely rewrite this function to match by `id`.

```typescript
const tier = existingTiers.find(t => t.id === config.id)
```

### 2. `ConfigModal.vue`: Coupling of ID and Label

Currently, `handleTierIdBlur` (line 288) syncs them:

```typescript
config.id = newValue
config.label = newValue
```

**Fix**:

* Stop updating `config.id` when user edits the text input.
* Only update `config.label`.
* `addTier`: Generate a unique `id` (e.g. `tier-${timestamp}`) instead of just 'A', 'B'. The `label` can still be 'A', 'B'.

### 3. Legacy Data Compatibility

* **Challenge**: Existing data has IDs like "S", "A".
* **Strategy**: "S" becomes the *Permanent ID* for that tier. "Rename" will only change the label.
  * *Example*: User renames "S" to "Super".
  * Data: `id: "S"`, `label: "Super"`.
  * This works fine without migration scripts.

## Plan of Action (Code Changes)

### Step 1: `src/types.ts`

* No strict type change needed (`id` and `label` already exist), but semantically `id` becomes immutable.

### Step 2: `src/components/ConfigModal.vue`

* Modify `addTier`: Generate sequential IDs (e.g. `t0`, `t1`, `t2`...) based on existing max ID index.
* Modify `handleTierIdBlur`: **REMOVE** `config.id = newValue`. Only set `config.label`.
* Update `inputValues` handling to map to `label`.

### Step 3: `src/App.vue`

* **CRITICAL**: Rewrite `handleUpdateConfigs`.
  * Remove `oldTierByOrder`.
  * Iterate `newConfigs`.
  * Find existing Tier by `id`.
  * If found -> Reuse (`newTiers.push(existingTier)`).
  * If not found -> Create new (`id: config.id`).
  * **Sort** `newTiers` based on `newConfigs` order (since `tiers` array order dictates render order).

### Step 4: `src/utils/storage.ts`

* Review `handleLanguageChange`. It checks `config.label`. This is fine, but we should ensure it doesn't touch `id`. (Checked: it only updates `label`).

### Potential Edge Cases

* **Legacy Data Compatibility**: Existing IDs "S", "A" etc. serve as valid unique IDs. New IDs will be `tN`. This mixed state is fine.
* **Export/Import**: Importing old data (where ID=Label) works fine. Importing new data (ID!=Label) works fine.

## Change Simulation (Before vs After)

### Scenario 1: Add Tier

* **Before**: Adds new sticky note at bottom. Row added at bottom.
* **After**: Adds new ID `t5`. New Row `t5-row-0`.
  * *Result*: Same success.

### Scenario 2: Delete Tier (Top/Middle)

* **Before**: Deletes sticky note. Bottom-most row data is lost (Bottom-Drop Bug). Items shift up visually but land in wrong tier.
* **After**: User deletes `t0` (Label: S).
  * Config list removes `t0`.
  * App logic detects `t0` is gone.
  * **Action**: `t0` items are **moved to Unranked**.
  * *Result*: No data loss. Items are safe in the holding area.

### Scenario 3: Swap Tiers (Reorder S and A)

* `t0` data stays with `t0` config.
* *Result*: **Success**. S Tier items move physically to the new location alongside the S Label.

### Scenario 4: Modify (Rename)

* **Before**: Changing "S" to "Super" changes ID to "Super". If logic mismatch, data lost.
* **After**: User changes Label to "Super". ID remains `t0`.
  * App updates only the display label.
  * *Result*: **Success**. Zero risk of data loss on rename.

### FAQ: Does `t1` become `t0` if I delete `t0`?

**No**.

* **Rule**: IDs are **Permanent** and **Non-Reusable**.
* **Why**: If `t1` automatically became `t0`, then any items belonging to `t1` would suddenly appear in the deleted `t0`'s old spot, or we would have to migrate all data every time a row is deleted.
* **Behavior**: If you delete `t0`, `t0` is gone forever. `t1` remains `t1`.
* **New Rows**: The next created row will be `t2` (or whatever the next available number is), ensuring no ID collides with past or present rows.

## Reset Behavior Prediction (Reset Settings)

When user clicks "Reset Settings", the system restores the **Default Tier Configuration** (S, A, B, C, D).

**Correction**: Default IDs are now standardized to `t0`, `t1`, `t2`, `t3`, `t4`.

### Scenario: User has completely customized the list

* **Current State**: User has `t5` ("My Tier"), `t0` ("S"), `t9` ("G").
* **Action**: Click "Reset".
* **Logic**:
    1. `tierConfigs` restored to Default (IDs: `t0`, `t1`, `t2`, `t3`, `t4`).
    2. `App.vue` syncs Tiers.
    3. **Conflict Resolution**:
        * `t0` (S): **EXISTS** in Default. It is kept!
            * *Outcome*: Items in `t0` remain in `t0` (Label reset to "S" or "夯").
        * `t5`, `t9`: **DO NOT EXIST** in Default.
            * *Outcome*: Items in `t5` and `t9` are moved to Unranked.
    4. **Result**:
        * Standard tiers (`t0`-`t4`) retain their items if they were present.
        * Custom tiers (`t5`, `t9`) release their items to Unranked.
        * New tiers (`t1`-`t4`) are created empty if they were missing.

### FAQ: If I delete `t4` and add a new tier, what is its ID?

**`t5`**.

* **Logic**: The system always calculates `Max(Existing IDs)` and adds 1.
* **Example**:
    1. Tiers: `t0`, `t1`, `t2`, `t3`, `t4`
    2. User deletes `t4`. Tiers: `t0`, `t1`, `t2`, `t3`.
    3. User adds Tier.
    4. System checks max ID used **ever**? No, simpler: check max ID currently in list (e.g. `t3`)?
    5. **Refined Logic**: To be safe, we should probably parse all existing IDs (e.g. `t0`...`t3`), find the max number (3), and add 1 -> `t4`.
    6. **WAIT**: If we reuse `t4`, and the user *just* deleted `t4` (sending items to Unranked), then creating `t4` again is... actually fine! It's a "clean" new tier.
    7. **BETTER LOGIC (Unique Session)**: To avoid any confusion or cache issues, we can use `t` + `timestamp` or a simple counter that only goes up.
    8. **DECISION**: **`t` + `Max(Existing ID Number) + 1`**.
        * If `t0`..`t3` exist, next is `t4`.
        * If `t0`, `t2` exist (t1 deleted), next is `t3`.
        * This effectively "fills gaps" at the end, but never reclaims a *currently used* ID.
