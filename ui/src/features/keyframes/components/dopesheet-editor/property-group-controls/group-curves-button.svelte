<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import LineChart from 'lucide-svelte/icons/chart-line'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { GroupCurvesButtonProps } from './types'

  let {
    groupProperties,
    groupLabel,
    curveVisible,
    onToggleGroupCurves,
    t,
  }: GroupCurvesButtonProps = $props()

  const label = $derived(
    t('timeline.keyframeEditor.showAllGroupCurves', {
      group: groupLabel,
      defaultValue: `Show all ${groupLabel} curves`,
    }),
  )
</script>

<Button
  type="button"
  variant="ghost"
  size="sm"
  class={cn(
    MINI_ICON_BUTTON_CLASS,
    'self-center text-muted-foreground hover:text-foreground',
    curveVisible ? 'text-primary hover:text-primary/80' : 'opacity-30 hover:opacity-60',
  )}
  onclick={(event) => {
    event.stopPropagation()
    onToggleGroupCurves(groupProperties)
  }}
  disabled={groupProperties.length === 0}
  title={label}
  aria-label={label}
  aria-pressed={curveVisible}
>
  <LineChart class={MINI_ICON_CLASS} />
</Button>
