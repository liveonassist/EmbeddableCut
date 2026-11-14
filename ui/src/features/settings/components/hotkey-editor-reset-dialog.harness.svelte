<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import { TooltipProvider } from '@/components/ui/tooltip'
  import { HotkeyEditor } from './hotkey-editor'
</script>

<TooltipProvider>
  <DialogPrimitive.Root open={true}>
    <HotkeyEditor />
  </DialogPrimitive.Root>
</TooltipProvider>
