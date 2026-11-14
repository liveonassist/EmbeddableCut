<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    mediaId: string
    onClose?: () => void
    variant?: 'panel' | 'program'
    interactive?: boolean
    seekFrame?: number | null
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
