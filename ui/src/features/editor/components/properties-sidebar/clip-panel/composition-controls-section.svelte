<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { CompositionControlDefinition } from '@/types/composition-controls'

  const EMPTY_CONTROLS: CompositionControlDefinition[] = []
</script>

<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import type { CompositionItem, TimelineItem } from '@/types/timeline'
  import { useCompositionsStore, updateItem } from '@/features/editor/deps/timeline-store'
  import { getCompositionControlSourceValue } from '@/shared/utils/composition-controls'
  import { ColorPicker, PropertyRow, PropertySection } from '../components'
  import TextControlInput from './composition-controls-text-input.svelte'

  let { items }: { items: TimelineItem[] } = $props()

  const compositionItem = $derived(
    items.length === 1 && items[0]?.type === 'composition' ? (items[0] as CompositionItem) : null,
  )
  const composition = $derived(
    select(useCompositionsStore, (state) =>
      compositionItem ? state.compositionById[compositionItem.compositionId] : undefined,
    ),
  )
  const controls = $derived(composition.current?.compositionControls?.controls ?? EMPTY_CONTROLS)

  const sourceValueById = $derived(
    new Map(
      controls.map((control) => [
        control.id,
        getCompositionControlSourceValue(composition.current?.items ?? [], control),
      ]),
    ),
  )

  const setControlValue = (
    item: CompositionItem,
    control: CompositionControlDefinition,
    value: string,
  ) => {
    const next = { ...(item.compositionControlOverrides ?? {}) }
    if (value === sourceValueById.get(control.id)) delete next[control.id]
    else next[control.id] = value
    updateItem(item.id, {
      compositionControlOverrides: Object.keys(next).length > 0 ? next : undefined,
    })
  }
</script>

{#snippet compositionOverrideRow(
  control: CompositionControlDefinition,
  value: string,
  sourceValue: string,
  isOverridden: boolean,
  onChange: (value: string) => void,
)}
  {@const resetLabel = t('editor.compositionControls.resetOverride', {
    defaultValue: 'Reset {{name}} override',
    name: control.name,
  })}
  <PropertyRow label={control.name}>
    <div class="flex min-w-0 flex-1 items-center gap-1">
      <span
        class={isOverridden ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-primary' : 'h-1.5 w-1.5 shrink-0'}
        aria-label={isOverridden
          ? t('editor.compositionControls.overridden', {
              defaultValue: '{{name}} is overridden',
              name: control.name,
            })
          : undefined}
        aria-hidden={isOverridden ? undefined : true}
      ></span>
      <div class="min-w-0 flex-1">
        {#if control.kind === 'text'}
          <TextControlInput {value} label={control.name} onCommit={onChange} />
        {:else}
          <ColorPicker color={value} {onChange} />
        {/if}
      </div>
      {#if isOverridden}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7 shrink-0 text-muted-foreground"
          onclick={() => onChange(sourceValue)}
          title={resetLabel}
          aria-label={resetLabel}
        >
          <RotateCcw class="h-3.5 w-3.5" />
        </Button>
      {/if}
    </div>
  </PropertyRow>
{/snippet}

{#if compositionItem && controls.length > 0}
  {@const item = compositionItem}
  <PropertySection
    title={t('editor.compositionControls.instanceTitle', { defaultValue: 'Template overrides' })}
    icon={SlidersHorizontal}
    defaultOpen
  >
    <p class="px-1 pb-2 text-[11px] leading-snug text-muted-foreground">
      {t('editor.compositionControls.instanceHint', {
        defaultValue:
          'Changes apply only to this instance. A blue dot marks values that differ from the source.',
      })}
    </p>
    {#each controls as control (control.id)}
      {@const sourceValue = sourceValueById.get(control.id) ?? control.defaultValue}
      {@const value = item.compositionControlOverrides?.[control.id] ?? sourceValue}
      {@const isOverridden = Object.prototype.hasOwnProperty.call(
        item.compositionControlOverrides ?? {},
        control.id,
      )}
      {@render compositionOverrideRow(control, value, sourceValue, isOverridden, (next) =>
        setControlValue(item, control, next),
      )}
    {/each}
    {#if item.compositionControlOverrides}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="mt-2 h-7 w-full justify-start gap-1.5 px-2 text-xs text-muted-foreground"
        onclick={() => updateItem(item.id, { compositionControlOverrides: undefined })}
      >
        <RotateCcw class="h-3.5 w-3.5" />
        {t('editor.compositionControls.resetAll', { defaultValue: 'Reset all overrides' })}
      </Button>
    {/if}
  </PropertySection>
{/if}
