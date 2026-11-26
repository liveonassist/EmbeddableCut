<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type {
    CompositionControlDefinition,
    CompositionControlProperty,
  } from '@/types/composition-controls'

  const EMPTY_CONTROLS: CompositionControlDefinition[] = []

  function propertyLabel(property: CompositionControlProperty): string {
    if (property === 'text.text') return 'Text'
    if (property === 'text.color') return 'Text color'
    if (property === 'shape.fillColor') return 'Fill color'
    return 'Stroke color'
  }

  function defaultControlName(targetLabel: string, property: CompositionControlProperty): string {
    if (property === 'text.text') return targetLabel
    return `${targetLabel} ${propertyLabel(property).toLowerCase()}`
  }
</script>

<script lang="ts">
  import Palette from '@lucide/svelte/icons/palette'
  import Plus from '@lucide/svelte/icons/plus'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Type from '@lucide/svelte/icons/type'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import {
    addCompositionControl,
    removeCompositionControl,
    useCompositionNavigationStore,
    useCompositionsStore,
    useItemsStore,
  } from '@/features/editor/deps/timeline-store'
  import { getCompositionControlCandidates } from '@/shared/utils/composition-controls'
  import { PropertySection } from '../components'
  import ControlNameInput from './control-name-input.svelte'

  let { defaultOpen = true }: { defaultOpen?: boolean } = $props()

  let addOpen = $state(false)
  const activeCompositionId = select(
    useCompositionNavigationStore,
    (state) => state.activeCompositionId,
  )
  const composition = $derived(
    select(useCompositionsStore, (state) =>
      activeCompositionId.current
        ? state.compositionById[activeCompositionId.current]
        : undefined,
    ),
  )
  const items = select(useItemsStore, (state) => state.items)
  const controls = $derived(composition.current?.compositionControls?.controls ?? EMPTY_CONTROLS)
  const existingTargets = $derived(
    new Set(controls.map((control) => `${control.targetItemId}:${control.property}`)),
  )
  const availableCandidates = $derived(
    getCompositionControlCandidates(items.current).filter(
      (candidate) => !existingTargets.has(`${candidate.targetItemId}:${candidate.property}`),
    ),
  )
  const itemLabelById = $derived(new Map(items.current.map((item) => [item.id, item.label])))
</script>

{#if activeCompositionId.current && composition.current?.editorKind === 'composite-2d'}
  {@const compositionId = activeCompositionId.current}
  <PropertySection
    title={t('editor.compositionControls.authoringTitle', {
      defaultValue: `Published controls (${controls.length})`,
    })}
    icon={SlidersHorizontal}
    {defaultOpen}
  >
    <p class="px-1 pb-2 text-[11px] leading-snug text-muted-foreground">
      {t('editor.compositionControls.authoringHint', {
        defaultValue:
          'Choose the text and colors that stay editable when this composition is reused.',
      })}
    </p>

    {#each controls as control (control.id)}
      <div
        class="group flex items-center gap-1.5 rounded-md py-1"
        data-testid={`composition-control-definition-${control.id}`}
      >
        {#if control.kind === 'text'}
          <Type class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {:else}
          <Palette class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {/if}
        <div class="min-w-0 flex-1">
          <ControlNameInput {compositionId} {control} />
          <div class="truncate px-2 pt-0.5 text-[10px] text-muted-foreground/70">
            {itemLabelById.get(control.targetItemId) ?? control.targetItemId} · {propertyLabel(
              control.property,
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onclick={() => removeCompositionControl(compositionId, control.id)}
          aria-label={`Remove ${control.name}`}
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    {/each}

    <Popover bind:open={addOpen}>
      <PopoverTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            type="button"
            variant="outline"
            size="sm"
            class={controls.length > 0
              ? 'mt-2 h-7 w-full gap-1.5 text-xs'
              : 'h-8 w-full gap-1.5 text-xs'}
            disabled={availableCandidates.length === 0}
          >
            <Plus class="h-3.5 w-3.5" />{controls.length > 0
              ? t('editor.compositionControls.addAnother', {
                  defaultValue: 'Expose another property',
                })
              : t('editor.compositionControls.add', { defaultValue: 'Expose property' })}
          </Button>
        {/snippet}
      </PopoverTrigger>
      <PopoverContent align="start" side="left" class="w-64 p-1.5">
        <div class="max-h-72 overflow-y-auto">
          {#each availableCandidates as candidate (`${candidate.targetItemId}:${candidate.property}`)}
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-secondary/60"
              onclick={() => {
                addCompositionControl(compositionId, {
                  ...candidate,
                  name: defaultControlName(candidate.targetLabel, candidate.property),
                })
                addOpen = false
              }}
            >
              {#if candidate.kind === 'text'}
                <Type class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {:else}
                <Palette class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {/if}
              <span class="min-w-0">
                <span class="block truncate text-xs">{candidate.targetLabel}</span>
                <span class="block text-[10px] text-muted-foreground">
                  {propertyLabel(candidate.property)}
                </span>
              </span>
            </button>
          {/each}
        </div>
      </PopoverContent>
    </Popover>
    {#if availableCandidates.length === 0}
      <p class="px-1 pt-2 text-[10px] leading-snug text-muted-foreground/80">
        {controls.length > 0
          ? t('editor.compositionControls.allExposed', {
              defaultValue: 'All supported properties are exposed.',
            })
          : t('editor.compositionControls.noCandidates', {
              defaultValue: 'Add a text or shape layer to expose editable properties.',
            })}
      </p>
    {/if}
  </PropertySection>
{/if}
