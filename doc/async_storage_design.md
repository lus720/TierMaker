# Async Storage Design Document

## 1. Overview

Current implementation uses `LocalStorage` to store everything including image data (as Base64 strings). This causes significant performance issues (UI blocking, memory bloat) because LocalStorage is synchronous and string-only.
We will migrate to **IndexedDB** using **localForage** to enable asynchronous, binary storage.

## 2. Technical Stack

- **Database**: IndexedDB (Browser Native)
- **Wrapper Library**: `localforage` (Promised-based, simple API)
- **URL Management**: `URL.createObjectURL()` / `URL.revokeObjectURL()`

## 3. Data Structure Changes

### Before (LocalStorage)

Stored as a single JSON string `tier-list-data`.

```json
[
  {
    "id": "S",
    "rows": [
      {
        "items": [
          { "image": "data:image/png;base64,....." } // Huge String
        ]
      }
    ]
  }
]
```

### After (IndexedDB)

We will likely keep a similar document structure for simplicity, BUT `localforage` allows us to store **Blobs** directly within the object.

```javascript
// Key: 'tier-list-data'
[
  {
    id: "S",
    rows: [
      {
        items: [
          {
            image: Blob(binary_data), // Stored as Binary Blob
            objectUrl: "blob:http://localhost:...", // Runtime only, generated on load
          },
        ],
      },
    ],
  },
];
```

_Note: We might separate images into a separate store if the document becomes too large, but for now, IndexedDB handles large objects reasonably well._

## 4. Workflows

### 4.1. Upload (SearchModal.vue)

1. User selects file.
2. `FileReader` **NOT** used for DataURL.
3. **Compression** (Optional but recommended): Draw to Canvas -> `canvas.toBlob()`.
4. Create ephemeral `blob:` URL for preview: `URL.createObjectURL(blob)`.
5. Pass `Blob` object + `URL` to parent.

### 4.2. Saving (storage.ts)

1. `saveTierData(tiers)` called.
2. Iterate through tiers, ensure all `image` fields are `Blob` objects.
   - _Challenge_: Note that JSON serialization (exports) needs Base64, but internal DB storage needs Blob.
3. `await localforage.setItem('tier-list-data', tiers)`.
   - localForage handles Blob serialization natively in IndexedDB.

### 4.3. Loading (App.vue)

1. `await localforage.getItem('tier-list-data')`.
2. **Hydration**: Iterate through all items.
   - If `item.image` is a `Blob`, generate `item.url = URL.createObjectURL(item.image)`.
   - Update `<img>` src to use this `item.url`.
3. Render UI.

### 4.4. Export to JSON (App.vue -> storage.ts)

IndexedDB Items (Blobs) -> **Convert to Base64** -> JSON String -> Download.
_Why?_ Blobs are browser-local. To share a file with another user, we must embed the image data as text (Base64) in the JSON file.

### 4.5. Import from JSON

Base64 String -> **Convert to Blob** -> Store in IndexedDB.

## 5. Migration Strategy

On App Boot (`main.ts` or `App.vue`):

1. Check if `localStorage.getItem('tier-list-data')` exists.
2. If yes:
   - Parse JSON.
   - Convert all `data:image...` strings to `Blob` objects.
   - `localforage.setItem(..., convertedData)`.
   - `localStorage.removeItem(...)`.
   - Reload / Proceed.

## 6. API Reference (Planned)

`src/utils/db.ts`

```typescript
import localforage from "localforage";

localforage.config({
  name: "TierMakerDB",
  storeName: "tiers",
});

export default localforage;
```

`src/utils/storage.ts`

```typescript
// All return Promises now
export async function saveTierData(tiers: Tier[]): Promise<void>;
export async function loadTierData(): Promise<Tier[]>;
```
