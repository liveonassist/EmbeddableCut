<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ClientRenderResult } from '@/features/export/deps/renderer'
  import { useExportDialogView } from './use-export-dialog-view.svelte'

  let {
    status,
    result,
    resetState,
    onClose,
    expose,
  }: {
    status: string
    result: ClientRenderResult | null
    resetState: () => void
    onClose: () => void
    expose: (view: ReturnType<typeof useExportDialogView>) => void
  } = $props()

  const view = useExportDialogView(() => ({ status, result, resetState, onClose }))
  // svelte-ignore state_referenced_locally
  expose(view)
</script>
