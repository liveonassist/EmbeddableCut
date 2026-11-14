<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    mediaId: string
    seekFrame: number | null
    containerSize: { width: number; height: number }
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
