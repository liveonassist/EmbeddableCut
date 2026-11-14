<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
  import { t } from '$lib/i18n.svelte'
  import EffectPanelHeaderActions from './effect-panel-header-actions.svelte'
  import { EFFECT_HEADER_CLASS, type EffectPanelHeaderRowProps } from './types'

  let { label, collapsed, onToggleCollapsed, ...actions }: EffectPanelHeaderRowProps = $props()

  // Surface a "modified" dot while collapsed so a graded clip reads as graded
  // without expanding the panel.
  const showModifiedDot = $derived(collapsed === true && !actions.isDefault)
  const modifiedLabel = $derived(
    t('effects.panel.modifiedFromDefaults', {
      defaultValue: 'Modified from defaults',
    }),
  )
</script>

{#if onToggleCollapsed}
  <div class={EFFECT_HEADER_CLASS}>
    <button
      type="button"
      onclick={onToggleCollapsed}
      aria-expanded={collapsed !== true}
      class="flex flex-1 items-center gap-1 min-w-0 text-left text-xs text-muted-foreground hover:text-foreground"
    >
      {#if collapsed === true}
        <ChevronRight class="w-3.5 h-3.5 flex-shrink-0" />
      {:else}
        <ChevronDown class="w-3.5 h-3.5 flex-shrink-0" />
      {/if}
      <span class="truncate">{label}</span>
      {#if showModifiedDot}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  class="ml-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center"
                  aria-label={modifiedLabel}
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
                </span>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="top">{modifiedLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      {/if}
    </button>
    <div class="flex items-center gap-1 min-w-0 justify-end">
      <EffectPanelHeaderActions {...actions} />
    </div>
  </div>
{:else}
  <div class={EFFECT_HEADER_CLASS}>
    <span class="min-w-0 truncate text-xs font-medium text-foreground/90">{label}</span>
    <div class="flex min-w-0 items-center justify-end gap-1">
      <EffectPanelHeaderActions {...actions} />
    </div>
  </div>
{/if}
