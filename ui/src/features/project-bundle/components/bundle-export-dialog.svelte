<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    open: boolean
    onClose: () => void
    projectId: string
    onBeforeExport?: () => Promise<void>
    fileHandle?: FileSystemFileHandle
  }

  const props: Props = $props()
  void props
</script>
