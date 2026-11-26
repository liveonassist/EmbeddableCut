<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Lock from '@lucide/svelte/icons/lock'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { PropertyRowLockButtonProps } from './types'

  let {
    rowLocked,
    property,
    rowLabel,
    visible,
    setAllRowsLocked,
    toggleLockedProperty,
    t,
  }: PropertyRowLockButtonProps = $props()

  const label = $derived(
    rowLocked
      ? t('timeline.keyframeEditor.unlockPropertyRow', {
          property: rowLabel,
          defaultValue: `Unlock ${rowLabel} row`,
        })
      : t('timeline.keyframeEditor.lockPropertyRow', {
          property: rowLabel,
          defaultValue: `Lock ${rowLabel} row`,
        }),
  )
</script>

{#if visible}
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class={cn(
      MINI_ICON_BUTTON_CLASS,
      'self-center text-muted-foreground hover:text-foreground',
      rowLocked ? 'text-red-400 hover:text-red-300' : 'opacity-30 hover:opacity-60',
    )}
    onclick={(event) => {
      event.stopPropagation()
      if (event.shiftKey) {
        setAllRowsLocked(!rowLocked)
        return
      }
      toggleLockedProperty(property)
    }}
    title={`${label} — ${t('timeline.keyframeEditor.lockAllRowsHint', {
      defaultValue: 'Shift-click to lock or unlock every row',
    })}`}
    aria-label={label}
    aria-pressed={rowLocked}
  >
    <Lock class={MINI_ICON_CLASS} />
  </Button>
{/if}
