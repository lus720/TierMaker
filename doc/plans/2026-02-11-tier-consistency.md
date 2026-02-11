# Brainstorming: Tier Consistency Solutions

**Problem**: Currently, items are bound to the distinct *Row Index* (e.g., Row 0, Row 1). When Tier Configs are reordered or deleted, the system maps the new Label 0 to the existing Row 0 data. This causes items to effectively "change tiers" or be deleted when the number of tiers decreases.

**Goal**: Ensure Items stick to their semantic Tier (e.g., if an item is in "S Tier", it should stay in "S Tier" even if "S Tier" is moved to the bottom).

Here are 3 proposed architectural solutions.

## Proposal 1: The "Stable UUID" Approach (Recommended)

This approach introduces a persistent, unique identifier for each Tier that survives renames and reorders.

### Concept

1. **Schema Change**:
    * Add `uuid` field to `TierConfig` (e.g., `uuid: '550e8400-...'`).
    * Add `uuid` field to `Tier` data structure.
2. **Migration**:
    * When loading legacy data, assign stable UUIDs to existing Tiers.
3. **Logic Logic**:
    * In `ConfigModal`: Ensure `uuid` is preserved when reordering. New tiers get new UUIDs.
    * In `App.vue`: When receiving updated configs, match `Tier` data to `TierConfig` using `uuid` instead of `order` or `id`.

### Pros & Cons

* ✅ **Robust**: Completely solves the issue. Renaming and reordering work perfectly.
* ✅ **Backward Compatible**: Easy migration path.
* ❌ **Complexity**: Requires adding UUID generation and management logic.

## Proposal 2: The "Immutable ID" Approach

This approach decouples the Display Label from the Internal ID.

### Concept

1. **Refactor**:
    * Currently, `id` and `label` are synced (User edits ID).
    * **Change**: `id` becomes a fixed internal string (e.g., `tier_0`, `tier_1`, generated on creation). It **NEVER** changes.
    * `label` becomes the only user-editable field.
2. **Logic Change**:
    * The `Tier` data structure continues to use `id`.
    * Because `id` never changes during a "Rename", the connection breaks only during "Reorder" if we rely on array index.
    * **Crucial Step**: We must also change the reordering logic to map by `id`.

### Pros & Cons

* ✅ **Clean Semantics**: Separates "Identity" from "Display".
* ❌ **User Friction**: Users might want to control the ID for export/URL purposes? (Likely not relevant here).
* ❌ **Legacy Data**: Existing data has IDs like "S", "A". If user wants to "Swap" meanings (rename S to A and A to S), immutable IDs might get confusing if the UI shows the ID anywhere.

## Proposal 3: The "Flat Store" Approach (Architecture Shift)

This approach flattens the data structure, removing the concept of "Rows" from the storage entirely.

### Concept

1. **Schema Change**:
    * Instead of `tiers: [{ items: [...] }]`, store `items: AnimeItem[]`.
    * Each `AnimeItem` gains a `tierId` property (pointing to `TierConfig.id` or UUID).
2. **Runtime**:
    * **Computed Tiers**: The View dynamically groups items: `items.filter(i => i.tierId === tier.id)`.
3. **Logic Change**:
    * Moving a Tier (Config) doesn't touch the Items at all.
    * Deleting a Tier -> Items become "Unranked" (tierId = null).

### Pros & Cons

* ✅ **Source of Truth**: Impossible to have "row mismatch" because rows don't exist in storage.

1. **Schema Change**:
    * Instead of `tiers: [{ items: [...] }]`, store `items: AnimeItem[]`.
    * Each `AnimeItem` gains a `tierId` property (pointing to `TierConfig.id` or UUID).
2. **Runtime**:
    * **Computed Tiers**: The View dynamically groups items: `items.filter(i => i.tierId === tier.id)`.
3. **Logic Change**:
    * Moving a Tier (Config) doesn't touch the Items at all.
    * Deleting a Tier -> Items become "Unranked" (tierId = null).

### Pros & Cons

* ✅ **Source of Truth**: Impossible to have "row mismatch" because rows don't exist in storage.
* ✅ **Flexibility**: Easy to implement "Filter by Tier", "Move Item to Unranked", etc.
* ❌ **Performance**: Grouping 1000+ items on every render might be slower (though unlikely to be a bottleneck for typical Tier Lists).
* ❌ **Refactor Cost**: High. Needs significant rewrite of `TierList`, `TierRow`, and `storage.ts`.

---

## Recommendation

**Proposal 2 (Immutable ID)** is the chosen path based on user preference. It decouples the visual `label` from the logical `id`.

1. **New IDs**: Generated as `tier_0`, `tier_1`, etc. (or UUIDs stringified).
2. **Migration**: Existing legacy IDs (e.g. "S") will be treated as the immutable ID for those specific tiers, while new ones get generated IDs. The `label` will be initialized to match the `id` for legacy data.
3. **UI Change**: The "Rename" feature in `ConfigModal` will ONLY change `label`. The `id` will remain constant.

### FAQ: Why not just use `id` as the UUID?

**Q:** Currently `TierConfig` has an `id` field. Why can't we just use that as the stable identifier?

**A:** Because in the current implementation, `id` and `label` are synonymous and mutable.

1. **Mutable Identity**: When a user renames a tier (e.g., from "S" to "Super"), the `id` property changes to "Super".
2. **Tracking Difficulty**: If `id` changes, we lose the link to the original data unless we implement complex tracking logic to say "S became Super".
3. **Data Loss Risk**: If we treat `id` as the primary key, renaming a tier looks like "Deleting Tier S" and "Creating Tier Super", which would cause all items in "S" to be lost or moved to Unranked.
4. **UUID Purpose**: A UUID is **immutable** (never changes) and **invisible** (user doesn't see it). This guarantees that no matter how many times the user renames or reorders the tier, the system knows exactly which tier it is.
