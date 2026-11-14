<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import type { DirectLinkableProperty } from '@/types/keyframe'
  import {
    EXPRESSION_GUIDE_ITEMS,
    EXPRESSION_GUIDE_SECTIONS,
    getExpressionPresets,
    type ExpressionGuideSectionId,
  } from './dopesheet-expression-catalog'

  interface DopesheetExpressionGuideProps {
    property: DirectLinkableProperty
    onApplyPreset: (source: string) => void
    onClose: () => void
  }

  let { property, onApplyPreset, onClose }: DopesheetExpressionGuideProps = $props()

  let activeSection = $state<ExpressionGuideSectionId>('basics')
  const presets = $derived(getExpressionPresets(property))
</script>

<div
  class="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border/70 bg-background/60"
  role="region"
  aria-label="Expression syntax guide"
>
  <div class="flex h-6 flex-shrink-0 items-center border-b border-border/60 px-1">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="h-5 gap-1 px-1.5 text-[9px]"
      onclick={onClose}
      aria-label="Close expression syntax guide"
    >
      <ArrowLeft class="h-2.5 w-2.5" />
      Syntax
    </Button>
    <div class="ml-1 flex min-w-0 flex-1 items-center gap-0.5" role="tablist">
      {#each EXPRESSION_GUIDE_SECTIONS as section (section.id)}
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === section.id}
          class={cn(
            'h-5 rounded px-1.5 text-[8px] text-muted-foreground hover:bg-accent hover:text-foreground',
            activeSection === section.id && 'bg-accent text-foreground',
          )}
          onclick={() => (activeSection = section.id)}
        >
          {section.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-1.5" role="tabpanel">
    {#if activeSection === 'recipes'}
      <div class="grid grid-cols-2 gap-1">
        {#each presets as preset (`${preset.group}-${preset.label}`)}
          <button
            type="button"
            class="min-w-0 rounded border border-border/60 bg-background/70 px-1.5 py-1 text-left hover:border-sky-500/50 hover:bg-sky-500/5"
            title={`${preset.description}\n${preset.source}`}
            onclick={() => onApplyPreset(preset.source)}
          >
            <span class="block truncate text-[9px] text-foreground">{preset.label}</span>
            <span class="block truncate font-mono text-[8px] text-muted-foreground">
              {preset.source}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-1">
        {#each EXPRESSION_GUIDE_ITEMS[activeSection] as item (item.title)}
          <div
            class="min-w-0 rounded border border-border/60 bg-background/70 px-1.5 py-1"
            title={item.description}
          >
            <div class="flex items-baseline gap-1">
              <span class="shrink-0 text-[8px] font-medium text-foreground">
                {item.title}
              </span>
              <code class="truncate text-[8px] text-sky-300">{item.syntax}</code>
            </div>
            <div class="truncate text-[8px] text-muted-foreground">{item.description}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
