<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    class?: string
    labelClass?: string
    descriptionClass?: string
    buttonClass?: string
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
