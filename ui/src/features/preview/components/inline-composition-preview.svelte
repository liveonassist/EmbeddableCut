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
  void props
</script>
