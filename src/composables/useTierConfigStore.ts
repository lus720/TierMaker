import { ref, type Ref } from 'vue'
import type { TierConfig, Tier, AnimeItem } from '../types'
import { loadTierConfigs, saveTierConfigs, getDefaultTiers, DEFAULT_TIER_CONFIGS } from '../utils/storage'

/**
 * Composable for managing tier configurations
 */
export function useTierConfigStore() {
  const tierConfigs = ref<TierConfig[]>(loadTierConfigs())

  function loadConfigs() {
    tierConfigs.value = loadTierConfigs()
  }

  function saveConfigs(configs: TierConfig[]) {
    tierConfigs.value = configs
    saveTierConfigs(configs)
  }

  function updateConfigs(newConfigs: TierConfig[], tierStore?: {
    tiers: Ref<Tier[]>,
    unrankedTiers: Ref<Tier[]>,
    addMultipleItemsToUnranked: (items: AnimeItem[]) => number
  }) {
    // If tierStore is provided, move items from removed tiers to unranked
    if (tierStore) {
      const removedTiers = tierStore.tiers.value.filter(t => !newConfigs.some(c => c.id === t.id))

      removedTiers.forEach(tier => {
        tier.rows.forEach(row => {
          if (row.items.length > 0) {
            // Add items to unranked
            tierStore.unrankedTiers.value[0].rows[0].items.push(...row.items)
          }
        })
      })
    }

    // Construct new tiers array based on newConfigs order (if tierStore provided)
    if (tierStore) {
      const newTiers: Tier[] = []

      newConfigs.forEach(config => {
        const existingTier = tierStore.tiers.value.find(t => t.id === config.id)

        if (existingTier) {
          // Keep existing tier data (ID is immutable, so no need to update it)
          newTiers.push(existingTier)
        } else {
          // Create new tier
          newTiers.push({
            id: config.id,
            rows: [{
              id: `${config.id}-row-0`,
              items: [],
            }],
          })
        }
      })

      tierStore.tiers.value = newTiers
    }

    // Update configs
    saveConfigs(newConfigs)
  }

  function resetToDefault(locale: string) {
    const defaultConfigs = getDefaultTiers(locale)
    updateConfigs(defaultConfigs)
  }

  return {
    tierConfigs,
    loadConfigs,
    saveConfigs,
    updateConfigs,
    resetToDefault,
  }
}