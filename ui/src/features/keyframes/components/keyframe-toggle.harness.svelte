<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { TooltipProvider } from '@/components/ui/tooltip'
  import KeyframeToggle from './keyframe-toggle.svelte'

  let props: ComponentProps<typeof KeyframeToggle> = $props()
</script>

<TooltipProvider>
  <KeyframeToggle {...props} />
</TooltipProvider>
