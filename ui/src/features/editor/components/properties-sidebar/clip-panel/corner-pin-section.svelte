<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'

  type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'

  const DEFAULT_PIN: NonNullable<TimelineItem['cornerPin']> = {
    topLeft: [0, 0] as [number, number],
    topRight: [0, 0] as [number, number],
    bottomRight: [0, 0] as [number, number],
    bottomLeft: [0, 0] as [number, number],
  }

  const CORNER_LABELS: Record<CornerKey, string> = {
    topLeft: 'TL',
    topRight: 'TR',
    bottomRight: 'BR',
    bottomLeft: 'BL',
  }
</script>

<script lang="ts">
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    resolveCornerPinTargetRect,
    resolveCornerPinForSize,
    withCornerPinReferenceSize,
  } from '@/features/editor/deps/composition-runtime'
  import { updateItem } from '@/features/editor/deps/timeline-store'
  import { useCornerPinStore } from '@/features/editor/deps/preview'
  import { PropertySection, PropertyRow, NumberInput } from '../components'

  interface CornerPinSectionProps {
    items: TimelineItem[]
  }

  /**
   * Corner Pin section — perspective warp via 4 corner offsets.
   * Only shown for single-item selection.
   */
  let { items }: CornerPinSectionProps = $props()

  const isCornerPinEditing = select(useCornerPinStore, (s) => s.isEditing)
  const editingItemId = select(useCornerPinStore, (s) => s.editingItemId)

  const item = $derived(items.length === 1 ? items[0]! : null)
  const cornerPin = $derived.by(() => {
    if (!item) return DEFAULT_PIN
    const targetRect = resolveCornerPinTargetRect(
      item.transform?.width ?? item.cornerPin?.referenceWidth ?? 0,
      item.transform?.height ?? item.cornerPin?.referenceHeight ?? 0,
      item.type === 'video' || item.type === 'image'
        ? {
            sourceWidth: item.sourceWidth,
            sourceHeight: item.sourceHeight,
            crop: item.crop,
          }
        : undefined,
    )
    return (
      resolveCornerPinForSize(item.cornerPin, targetRect.width, targetRect.height) ?? DEFAULT_PIN
    )
  })
  const isEditingThisItem = $derived(isCornerPinEditing.current && editingItemId.current === item?.id)

  const hasAnyOffset = $derived(
    cornerPin.topLeft[0] !== 0 ||
      cornerPin.topLeft[1] !== 0 ||
      cornerPin.topRight[0] !== 0 ||
      cornerPin.topRight[1] !== 0 ||
      cornerPin.bottomRight[0] !== 0 ||
      cornerPin.bottomRight[1] !== 0 ||
      cornerPin.bottomLeft[0] !== 0 ||
      cornerPin.bottomLeft[1] !== 0,
  )

  // Update a single corner's X or Y value
  const handleCornerChange = (corner: CornerKey, axis: 0 | 1, value: number) => {
    if (!item) return
    const current = item.cornerPin ?? DEFAULT_PIN
    const newCorner: [number, number] = [...current[corner]]
    newCorner[axis] = value
    const targetRect = resolveCornerPinTargetRect(
      item.transform?.width ?? current.referenceWidth ?? 0,
      item.transform?.height ?? current.referenceHeight ?? 0,
      item.type === 'video' || item.type === 'image'
        ? {
            sourceWidth: item.sourceWidth,
            sourceHeight: item.sourceHeight,
            crop: item.crop,
          }
        : undefined,
    )
    updateItem(item.id, {
      cornerPin: withCornerPinReferenceSize(
        { ...current, [corner]: newCorner },
        targetRect.width,
        targetRect.height,
      ),
    })
  }

  // Reset all corners to [0, 0]
  const handleReset = () => {
    if (!item) return
    updateItem(item.id, { cornerPin: undefined })
  }

  // Toggle interactive editing
  const toggleEditMode = () => {
    if (isEditingThisItem) {
      useCornerPinStore.getState().stopEditing()
    } else if (item) {
      useCornerPinStore.getState().startEditing(item.id)
    }
  }
</script>

{#if item && items.length <= 1}
  <PropertySection
    title={t('editor.cornerPinSection.title')}
    icon={Maximize2}
    defaultOpen={false}
  >
    <!-- Edit + Reset toolbar -->
    <div class="flex items-center gap-1 px-1 mb-2">
      <Button
        variant={isEditingThisItem ? 'default' : 'outline'}
        size="sm"
        class="h-7 text-xs flex-1 gap-1"
        onclick={toggleEditMode}
        title={isEditingThisItem
          ? t('editor.cornerPinSection.exitEditor')
          : t('editor.cornerPinSection.editOnPreview')}
      >
        <Maximize2 class="w-3 h-3" />
        {isEditingThisItem
          ? t('editor.cornerPinSection.editing')
          : t('editor.cornerPinSection.edit')}
      </Button>
      {#if hasAnyOffset}
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleReset}
          title={t('editor.cornerPinSection.reset')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      {/if}
    </div>

    <!-- Corner inputs - 4 rows with X/Y for each corner -->
    {#each Object.keys(CORNER_LABELS) as CornerKey[] as corner (corner)}
      <PropertyRow label={CORNER_LABELS[corner]}>
        <div class="flex items-center gap-1 w-full">
          <NumberInput
            value={cornerPin[corner][0]}
            onChange={(v) => handleCornerChange(corner, 0, v)}
            min={-2000}
            max={2000}
            step={1}
            unit="x"
            class="flex-1 min-w-0"
          />
          <NumberInput
            value={cornerPin[corner][1]}
            onChange={(v) => handleCornerChange(corner, 1, v)}
            min={-2000}
            max={2000}
            step={1}
            unit="y"
            class="flex-1 min-w-0"
          />
        </div>
      </PropertyRow>
    {/each}
  </PropertySection>
{/if}
