<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import SourceMonitorContent from './source-monitor/source-monitor-content.svelte'

  interface SourceMonitorProps {
    mediaId: string
    onClose?: () => void
    variant?: 'panel' | 'program'
    interactive?: boolean
    seekFrame?: number | null
  }

  let { mediaId, onClose, variant = 'panel', interactive = true, seekFrame = null }: SourceMonitorProps = $props()
</script>

{#key mediaId}
  <SourceMonitorContent
    mediaId={mediaId}
    onClose={onClose}
    variant={variant}
    interactive={interactive}
    seekFrame={seekFrame}
   />
{/key}
