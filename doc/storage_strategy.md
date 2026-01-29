# TierMaker Storage Strategy

## Overview

This document outlines the storage architecture for the TierMaker application. The system has been migrated from `localStorage` (Base64 strings) to **IndexedDB** (Binary Blobs) to support large images, improve performance, and prevent UI blocking.

## Core Technologies

- **Storage Engine**: [localForage](https://localforage.github.io/localForage/)
- **Driver**: `IndexedDB` (Enforced)
- **Data Format**: Binary `Blob` objects for images, JSON-serializable objects for metadata.

---

## Data Flow Architecture

### 1. Data Structure

The application state is split into two reactive arrays in `App.vue`:

1.  `tiers`: The ranked tiers (S, A, B, etc.)
2.  `unrankedTiers`: The holding area for new/unranked items.

**Critical:** When saving, these two arrays are **merged** into a single list. When loading, they are separated again.

### 2. The `AnimeItem` Interface

To handle the dual nature of images (Display vs Storage), we use a hybrid approach:

```typescript
interface AnimeItem {
  id: string;
  name: string;
  // Display Phase: string (blob:http://...)
  // Storage Phase: Blob (binary data)
  image: string | Blob;

  // Runtime Cache
  // Holds the original Blob so we don't need to re-fetch it from the blob URL on save
  _blob?: Blob;
}
```

### 3. Saving Data (`saveTierData`)

The save process requires strict hygiene to prevent `DataCloneError` caused by Vue Proxies.

1.  **Unwrap Proxies**: We use `Vue.toRaw()` to recursively convert the Reactive `tiers` array back to plain JavaScript objects. **IndexedDB cannot store Vue Proxies.**
2.  **Merge**: `tiers` and `unrankedTiers` are combined.
3.  **Blob Selection**:
    - The code explicitly checks for `item._blob`.
    - If present, it saves `_blob` (the binary) instead of `image` (the URL string).
4.  **Write**: The cleaned, plain object tree is written to `localforage`.

### 4. Loading & Hydration (`loadTierData`)

Reading data is a multi-step process to ensure the UI can display the binary data.

1.  **Read**: Fetch raw data from `IndexedDB`.
2.  **Auto-Repair (Self-Healing)**:
    - Scans for legacy Base64 strings (`data:image/...`).
    - If found, converts them to `Blob` immediately and flags a re-save.
3.  **Hydration (App.vue)**:
    - Iterates through all items.
    - Calls `URL.createObjectURL(item.image)` to generate a displayable URL.
    - Sets `item.image` = `blob:url`.
    - Sets `item._blob` = `original blob` (to keep it ready for the next save).

---

## Common Pitfalls & Solutions

### "Images Disappear on Reload"

- **Cause**: Saving `blob:http://...` strings to the database. These URLs are temporary and revoked on page unload.
- **Fix**: Ensure `_blob` is set when creating items, and `saveTierData` prefers `_blob`.

### "DataCloneError on Save"

- **Cause**: Passing a Vue `ref` or `reactive` object directly to `db.setItem`.
- **Fix**: Always use `toRaw()` on the data before saving.

### "Unranked Items Disappear"

- **Cause**: Calling `saveTierData(tiers.value)` ignores `unrankedTiers`.
- **Fix**: Always call `saveTierData([...tiers.value, ...unrankedTiers.value])`.

---

## Migration Logic

The app includes a one-time migration script (`migrateFromLocalStorage`) that runs on startup. It:

1.  Detects `tier-list-data` in `localStorage`.
2.  Parses the JSON.
3.  Iterates and converts all Base64 strings to Blobs.
4.  Saves to `IndexedDB`.
5.  Clears `localStorage`.
