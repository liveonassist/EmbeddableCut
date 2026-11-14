<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    project: { width: number; height: number; backgroundColor?: string }
    containerSize: { width: number; height: number }
    suspendOverlay?: boolean
    chrome?: 'edit' | 'color'
  }

  const props: Props = $props()
  void props
</script>
