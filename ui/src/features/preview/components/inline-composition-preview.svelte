<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    compositionId: string
    seekFrame: number | null
    containerSize: { width: number; height: number }
    presentation?: 'workspace' | 'frame'
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
