<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Lock from 'lucide-svelte/icons/lock'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { GroupLockButtonProps } from './types'

  let {
    groupProperties,
    groupLabel,
    allRowsLocked,
    setAllRowsLocked,
    setGroupLocked,
    t,
  }: GroupLockButtonProps = $props()

  const label = $derived(
    allRowsLocked
      ? t('timeline.keyframeEditor.unlockGroupRows', {
          group: groupLabel,
          defaultValue: `Unlock ${groupLabel} rows`,
        })
      : t('timeline.keyframeEditor.lockGroupRows', {
          group: groupLabel,
          defaultValue: `Lock ${groupLabel} rows`,
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
    allRowsLocked ? 'text-red-400 hover:text-red-300' : 'opacity-30 hover:opacity-60',
  )}
  onclick={(event) => {
    event.stopPropagation()
    if (event.shiftKey) {
      setAllRowsLocked(!allRowsLocked)
      return
    }
    setGroupLocked(groupProperties, !allRowsLocked)
  }}
  disabled={groupProperties.length === 0}
  title={`${label} — ${t('timeline.keyframeEditor.lockAllRowsHint', {
    defaultValue: 'Shift-click to lock or unlock every row',
  })}`}
  aria-label={label}
  aria-pressed={allRowsLocked}
>
  <Lock class={MINI_ICON_CLASS} />
</Button>
