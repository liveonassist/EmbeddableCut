<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
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

  interface DopesheetViewOptionsMenuProps {
    disabled: boolean
    visualizationMode: 'dopesheet' | 'graph'
    graphRulerUnit: 'frames' | 'seconds'
    onChangeRulerUnit: (unit: 'frames' | 'seconds') => void
    graphHandleVisibility: 'selected' | 'all'
    onToggleGraphHandleVisibility: () => void
    autoZoomGraphHeight: boolean
    onToggleAutoZoomGraphHeight: () => void
  }

  let {
    disabled,
    visualizationMode,
    graphRulerUnit,
    onChangeRulerUnit,
    graphHandleVisibility,
    onToggleGraphHandleVisibility,
    autoZoomGraphHeight,
    onToggleAutoZoomGraphHeight,
  }: DopesheetViewOptionsMenuProps = $props()

  const menuLabel = $derived(
    visualizationMode === 'graph'
      ? t('timeline.keyframeEditor.graphViewOptions')
      : t('timeline.keyframeEditor.sheetViewOptions'),
  )
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="sm"
        class="h-6 w-6 p-0"
        {disabled}
        aria-label={menuLabel}
        title={menuLabel}
      >
        <MoreHorizontal class="h-3 w-3" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" class="w-[220px]">
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        onChangeRulerUnit('seconds')
      }}
    >
      <Check class={cn('h-3.5 w-3.5', graphRulerUnit !== 'seconds' && 'opacity-0')} />
      {t('timeline.keyframeEditor.displayTimeRulerSeconds')}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        onChangeRulerUnit('frames')
      }}
    >
      <Check class={cn('h-3.5 w-3.5', graphRulerUnit !== 'frames' && 'opacity-0')} />
      {t('timeline.keyframeEditor.displayTimeRulerFrames')}
    </DropdownMenuItem>
    {#if visualizationMode === 'graph'}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault()
          onToggleGraphHandleVisibility()
        }}
      >
        <Check class={cn('h-3.5 w-3.5', graphHandleVisibility !== 'all' && 'opacity-0')} />
        {t('timeline.keyframeEditor.showAllHandles')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault()
          onToggleAutoZoomGraphHeight()
        }}
      >
        <Check class={cn('h-3.5 w-3.5', !autoZoomGraphHeight && 'opacity-0')} />
        {t('timeline.keyframeEditor.autoZoomGraphHeight')}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
