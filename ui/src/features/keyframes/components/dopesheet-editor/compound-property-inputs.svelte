<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import Link2 from '@lucide/svelte/icons/link-2'
  import Unlink2 from '@lucide/svelte/icons/unlink-2'
  import CompoundPropertyAxisInput from './compound-property-axis-input.svelte'
  import {
    createCompoundAxisCallbacks,
    type CompoundPropertyInputConfig,
  } from './compound-property-inputs'

  let { config, spacious = false }: { config: CompoundPropertyInputConfig; spacious?: boolean } =
    $props()

  const AXES = ['x', 'y'] as const

  // The live source drives the two axis inputs directly, so a canvas gesture
  // refreshes them without re-rendering whatever owns `config`.
  let liveValue = $state.raw(untrack(() => config.liveValueSource?.getSnapshot() ?? null))
  $effect.pre(() => {
    const source = config.liveValueSource
    if (!source) {
      liveValue = null
      return
    }
    liveValue = source.getSnapshot()
    return source.subscribe(() => {
      liveValue = source.getSnapshot()
    })
  })
</script>

<div
  class="flex shrink-0 items-center overflow-hidden rounded-sm border border-border/70 {spacious
    ? 'w-[192px]'
    : 'w-[132px]'} {config.linked ? 'border-primary/50 text-primary' : ''}"
  data-testid="compound-property-inputs"
>
  {#if config.axisLink}
    <button
      type="button"
      class="flex h-5 w-5 shrink-0 items-center justify-center border-r border-border/70 text-muted-foreground hover:text-foreground"
      aria-label={config.axisLink.linked ? `Unlink ${config.label} axes` : `Link ${config.label} axes`}
      aria-pressed={config.axisLink.linked}
      onclick={() => config.axisLink?.onChange(!config.axisLink.linked)}
    >
      {#if config.axisLink.linked}
        <Link2 class="h-2.5 w-2.5" />
      {:else}
        <Unlink2 class="h-2.5 w-2.5" />
      {/if}
    </button>
  {:else if spacious}
    <span
      aria-hidden="true"
      class="h-5 w-5 shrink-0 border-r border-border/70"
      data-testid="compound-property-axis-link-spacer"
    ></span>
  {/if}
  {#each AXES as axis (axis)}
    <CompoundPropertyAxisInput
      {axis}
      value={liveValue?.[axis] ?? config.value[axis]}
      unit={config.unit}
      propertyLabel={config.label}
      showAxisLabel={config.showAxisLabels ?? true}
      disabled={config.disabled ?? false}
      allowCreateOnBlur={config.allowCreateOnBlur ?? false}
      {...createCompoundAxisCallbacks(config, axis)}
      scrubStep={config.scrubStep}
      decimals={config.decimals}
    />
  {/each}
</div>
