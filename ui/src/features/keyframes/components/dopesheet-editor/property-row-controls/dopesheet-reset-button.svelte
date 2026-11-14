<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { DopesheetResetButtonProps } from './types'

  let { label, onReset }: DopesheetResetButtonProps = $props()
</script>

<Button
  type="button"
  variant="ghost"
  size="sm"
  class={cn(MINI_ICON_BUTTON_CLASS, 'text-muted-foreground hover:text-foreground')}
  onclick={(event) => {
    event.stopPropagation()
    onReset()
  }}
  aria-label={label}
  title={label}
>
  <X class={MINI_ICON_CLASS} />
</Button>
