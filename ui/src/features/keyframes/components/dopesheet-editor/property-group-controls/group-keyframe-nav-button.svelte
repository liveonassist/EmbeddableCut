<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { GroupKeyframeNavButtonProps } from './types'

  let {
    direction,
    entry,
    fallbackProperty,
    groupLabel,
    disabled,
    canNavigate,
    onNavigate,
    t,
  }: GroupKeyframeNavButtonProps = $props()

  const isPrev = $derived(direction === 'prev')
  const Icon = $derived(isPrev ? ChevronLeft : ChevronRight)
  const label = $derived(
    isPrev
      ? t('timeline.keyframeEditor.previousGroupKeyframe', {
          group: groupLabel,
          defaultValue: `Previous ${groupLabel} keyframe`,
        })
      : t('timeline.keyframeEditor.nextGroupKeyframe', {
          group: groupLabel,
          defaultValue: `Next ${groupLabel} keyframe`,
        }),
  )
</script>

<Button
  type="button"
  variant="ghost"
  size="sm"
  class={cn(MINI_ICON_BUTTON_CLASS, 'text-muted-foreground hover:text-foreground')}
  onclick={(event) => {
    event.stopPropagation()
    onNavigate(entry?.property ?? fallbackProperty, entry?.keyframe ?? null)
  }}
  disabled={disabled || !entry || !canNavigate}
  title={label}
  aria-label={label}
>
  <Icon class={MINI_ICON_CLASS} />
</Button>
