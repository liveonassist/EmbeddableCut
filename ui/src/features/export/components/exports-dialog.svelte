<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    open: boolean
    onClose: () => void
    projectId: string
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
