<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import { cn } from '@/shared/ui/cn'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

  interface StageSectionProps {
    /** Uppercase intent label (e.g. "Entrance", "Loop & behaviors"). */
    title: string
    /** One-line description of what the stage does / how it behaves. */
    hint?: string
    defaultOpen?: boolean
    children: Snippet
  }

  /**
   * Collapsible intent stage. Keyframed layer recipes and live text/layer motion
   * can share a stage without coupling their specialized render engines.
   */
  let { title, hint, defaultOpen = true, children }: StageSectionProps = $props()

  // svelte-ignore state_referenced_locally
  let open = $state(defaultOpen)
</script>

<Collapsible bind:open class="flex flex-col gap-2">
  <CollapsibleTrigger class="group flex items-center justify-between gap-2 text-left">
    <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {title}
    </span>
    <ChevronDown
      class={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform', !open && '-rotate-90')}
    />
  </CollapsibleTrigger>
  <CollapsibleContent class="flex flex-col gap-2">
    {#if hint}<p class="text-[10px] leading-snug text-muted-foreground/70">{hint}</p>{/if}
    {@render children()}
  </CollapsibleContent>
</Collapsible>
