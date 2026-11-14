<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { GroupExpandButtonProps } from './types'

  let {
    groupId,
    groupLabel,
    isOpen,
    setAllGroupsExpanded,
    toggleGroup,
    t,
  }: GroupExpandButtonProps = $props()

  const chevronClass = cn(
    MINI_ICON_CLASS,
    'flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground/80',
  )
</script>

<button
  type="button"
  class="group flex min-w-0 flex-1 items-center gap-px rounded-sm px-0 text-left leading-none transition-colors hover:bg-background/40"
  onclick={(event) => {
    if (event.shiftKey) {
      setAllGroupsExpanded(!isOpen)
      return
    }
    toggleGroup(groupId)
  }}
  title={t('timeline.keyframeEditor.shiftToggleAllGroups', {
    defaultValue: 'Shift-click to expand or collapse all property groups',
  })}
  aria-expanded={isOpen}
  aria-label={isOpen
    ? t('timeline.keyframeEditor.collapseGroup', {
        group: groupLabel,
        defaultValue: `Collapse ${groupLabel}`,
      })
    : t('timeline.keyframeEditor.expandGroup', {
        group: groupLabel,
        defaultValue: `Expand ${groupLabel}`,
      })}
>
  {#if isOpen}
    <ChevronDown class={chevronClass} />
  {:else}
    <ChevronRight class={chevronClass} />
  {/if}
  <span
    class="truncate pl-px text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-foreground"
  >
    {groupLabel}
  </span>
</button>
