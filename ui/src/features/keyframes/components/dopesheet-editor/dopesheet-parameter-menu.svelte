<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import Check from 'lucide-svelte/icons/check'
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { getKeyframeGroupLabel } from '@/features/keyframes/utils/property-i18n'
  import type { PropertyAccordionGroup } from './property-groups'

  interface DopesheetParameterMenuProps {
    disabled: boolean
    hasAvailableProperties: boolean
    parameterFilter: 'all' | 'keyframed'
    onToggleKeyframedOnly: () => void
    allPropertyGroups: PropertyAccordionGroup[]
    visibleGroups: Record<string, boolean>
    onToggleVisibleGroup: (id: string) => void
    onExpandAll: () => void
    onCollapseAll: () => void
    onResetParameterView: () => void
  }

  let {
    disabled,
    hasAvailableProperties,
    parameterFilter,
    onToggleKeyframedOnly,
    allPropertyGroups,
    visibleGroups,
    onToggleVisibleGroup,
    onExpandAll,
    onCollapseAll,
    onResetParameterView,
  }: DopesheetParameterMenuProps = $props()
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        disabled={disabled || !hasAvailableProperties}
        aria-label={t('timeline.keyframeEditor.parameterDisplayOptions')}
      >
        <MoreHorizontal class="h-3.5 w-3.5" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" class="w-[240px]">
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        onToggleKeyframedOnly()
      }}
    >
      <Check class={cn('h-3.5 w-3.5', parameterFilter !== 'keyframed' && 'opacity-0')} />
      {t('timeline.keyframeEditor.displayKeyframedParameters')}
    </DropdownMenuItem>
    {#if allPropertyGroups.length > 0}
      <DropdownMenuSeparator />
    {/if}
    {#each allPropertyGroups as group (group.id)}
      {@const isVisible = visibleGroups[group.id] ?? true}
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault()
          onToggleVisibleGroup(group.id)
        }}
      >
        <Check class={cn('h-3.5 w-3.5', !isVisible && 'opacity-0')} />
        {t('timeline.keyframeEditor.displayGroupParameters', {
          group: getKeyframeGroupLabel(t as TFunction, group.id, group.label),
        })}
      </DropdownMenuItem>
    {/each}
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={onExpandAll}>
      {t('timeline.keyframeEditor.expandAllParameters')}
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={onCollapseAll}>
      {t('timeline.keyframeEditor.collapseAllParameters')}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={onResetParameterView}>
      {t('timeline.keyframeEditor.resetParameterView')}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
