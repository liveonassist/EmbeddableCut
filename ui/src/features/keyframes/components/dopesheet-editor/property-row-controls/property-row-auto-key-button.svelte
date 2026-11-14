<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Timer from 'lucide-svelte/icons/timer'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { PropertyRowAutoKeyButtonProps } from './types'

  let {
    property,
    rowLabel,
    autoKeyEnabled,
    disabled,
    rowLocked,
    canCommit,
    onToggleAutoKey,
    t,
  }: PropertyRowAutoKeyButtonProps = $props()

  const label = $derived(
    autoKeyEnabled
      ? t('timeline.keyframeEditor.autoKeyEnabledFor', {
          target: rowLabel,
          defaultValue: `Auto-key enabled for ${rowLabel}`,
        })
      : t('timeline.keyframeEditor.enableAutoKeyFor', {
          target: rowLabel,
          defaultValue: `Enable auto-key for ${rowLabel}`,
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
    autoKeyEnabled &&
      'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
  )}
  onclick={() => onToggleAutoKey(property)}
  disabled={disabled || rowLocked || !canCommit}
  title={label}
  aria-label={label}
  aria-pressed={autoKeyEnabled ?? false}
>
  <Timer class={MINI_ICON_CLASS} />
</Button>
