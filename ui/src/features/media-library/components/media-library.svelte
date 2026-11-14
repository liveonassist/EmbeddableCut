<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    onMediaSelect?: (mediaId: string) => void
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
