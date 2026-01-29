/**
 * IndexedDB Wrapper using localForage
 */
import localforage from 'localforage'

// Initialize the database
const db = localforage.createInstance({
  name: 'TierMakerDB',
  storeName: 'tiers',
  description: 'Storage for tier lists and images',
  driver: localforage.INDEXEDDB // Force IndexedDB
})

export default db
