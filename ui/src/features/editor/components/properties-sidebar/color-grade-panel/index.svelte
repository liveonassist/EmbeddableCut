<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  let effectsContract: Promise<typeof import('@/features/editor/deps/effects-contract')> | null =
    null
  const loadEffectsContract = () =>
    (effectsContract ??= import('@/features/editor/deps/effects-contract'))

  /**
   * Color workspace inspector: always-visible grade controls (wheels + curves)
   * on top, with the remaining effect stack below. Shown in place of the
   * regular clip panel while the Color workspace is active.
   */
  const COLOR_PANEL_EFFECT_TYPES = ['gpu-color-wheels', 'gpu-curves'] as const
  const COLOR_KEYFRAME_VISIBLE_GROUPS = ['effects'] as const
  const COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH = 336
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select, shallow } from '$lib/store.svelte'
  import Palette from 'lucide-svelte/icons/palette'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useItemsStore } from '@/features/editor/deps/timeline-store'
  import { KeyframeGraphPanel } from '@/features/editor/deps/timeline-keyframe-ui'
  import { addAdjustmentLayer } from '@/features/editor/utils/add-adjustment-layer'
  import type { TimelineItem } from '@/types/timeline'

  interface ColorGradePanelProps {
    layout?: 'sidebar' | 'dock'
  }

  let { layout = 'sidebar' }: ColorGradePanelProps = $props()

  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const visualItems = $derived(
    select(
      useItemsStore,
      (s) => {
        const items: TimelineItem[] = []
        for (const itemId of selectedItemIds.current) {
          const item = s.itemById[itemId]
          if (item && item.type !== 'audio') {
            items.push(item)
          }
        }
        return items
      },
      shallow,
    ),
  )

  const handleCreateAdjustmentLayer = () => {
    addAdjustmentLayer(undefined, t('editor.colorPanel.adjustmentLayerLabel'))
  }
  const handleKeepKeyframesOpen = () => {
    // The Color page owns this dock; the shared keyframe editor needs a close
    // callback for its sidebar placement but the color lane is intentionally fixed.
  }

  const hasVisualSelection = $derived(visualItems.current.length > 0)
  const sectionClassName = $derived(layout === 'dock' ? 'min-h-0 overflow-hidden' : undefined)
</script>

{#if !hasVisualSelection}
  <div
    class="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 py-10 text-center"
  >
    <Palette class="h-6 w-6 text-muted-foreground" aria-hidden="true" />
    <p class="text-xs text-muted-foreground">{t('editor.colorPanel.emptyState')}</p>
  </div>
{:else if layout === 'dock'}
  <div class="grid h-full min-h-0 grid-cols-[minmax(0,10fr)_minmax(0,3fr)_minmax(0,7fr)] gap-3">
    {#await loadEffectsContract() then { ColorGradeSection, EffectsSection }}
      <div class={sectionClassName}>
        <ColorGradeSection
          items={visualItems.current}
          {layout}
          onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
        />
      </div>
      <div class="min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35">
        <EffectsSection
          items={visualItems.current}
          hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES}
          layout="dock"
        />
      </div>
      <div
        class="min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35"
        data-testid="color-keyframes-lane"
      >
        <KeyframeGraphPanel
          isOpen={true}
          placement="side"
          showCloseButton={false}
          onClose={handleKeepKeyframesOpen}
          initialVisibleGroupIds={COLOR_KEYFRAME_VISIBLE_GROUPS}
          propertyColumnWidth={COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH}
        />
      </div>
    {/await}
  </div>
{:else}
  <div class="space-y-3">
    {#await loadEffectsContract() then { ColorGradeSection, EffectsSection }}
      <div class={sectionClassName}>
        <ColorGradeSection
          items={visualItems.current}
          {layout}
          onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
        />
      </div>
      <div class={sectionClassName}>
        <EffectsSection items={visualItems.current} hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES} />
      </div>
    {/await}
  </div>
{/if}
