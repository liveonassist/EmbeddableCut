<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { Snippet } from 'svelte'
  import type { Icon as LucideIcon } from 'lucide-svelte'

  interface PropertySectionProps {
    title: string
    icon?: typeof LucideIcon
    defaultOpen?: boolean
    children: Snippet
  }

  /** Every mounted PropertySection, so a shift-click can drive all of them at once. */
  const openStateSubscribers = new Set<(open: boolean) => void>()
</script>

<script lang="ts">
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { cn } from '@/shared/ui/cn'

  /**
   * Collapsible section wrapper for property groups.
   * Used for Source, Layout, Fill, Video, Audio sections.
   *
   * Shift-clicking a header collapses every section (or expands them all, when the
   * clicked header was already collapsed).
   */
  let { title, icon: Icon, defaultOpen = true, children }: PropertySectionProps = $props()

  // svelte-ignore state_referenced_locally
  let open = $state(defaultOpen)

  $effect(() => {
    const setOpen = (next: boolean) => {
      open = next
    }
    openStateSubscribers.add(setOpen)
    return () => {
      openStateSubscribers.delete(setOpen)
    }
  })

  const setAllSectionsOpen = (next: boolean) => {
    for (const setSectionOpen of openStateSubscribers) setSectionOpen(next)
  }

  const handleTriggerClick = (event: MouseEvent) => {
    if (!event.shiftKey) return
    // bits-ui skips its own toggle when the click is default-prevented, so this
    // header is driven by the broadcast like every other one.
    event.preventDefault()
    setAllSectionsOpen(!open)
  }

  // Activating the button by key synthesizes a click, but only carries shiftKey
  // if Shift is still held when that click is dispatched — and Space dispatches
  // it on keyup. Read the modifier off the keydown, where it is unambiguous, and
  // suppress the activation so no click follows.
  const handleTriggerKeyDown = (event: KeyboardEvent) => {
    if (!event.shiftKey || event.repeat) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setAllSectionsOpen(!open)
  }
</script>

<Collapsible bind:open>
  <CollapsibleTrigger
    onclick={handleTriggerClick}
    onkeydown={handleTriggerKeyDown}
    class="flex items-center gap-2 w-full py-2 hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors"
  >
    <ChevronRight
      class={cn('w-3 h-3 text-muted-foreground transition-transform', open && 'rotate-90')}
    />
    {#if Icon}
      <Icon class="w-3 h-3 text-muted-foreground" />
    {/if}
    <span class="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
      {title}
    </span>
  </CollapsibleTrigger>
  <CollapsibleContent class="pt-1 pb-2 space-y-0">{@render children()}</CollapsibleContent>
</Collapsible>
