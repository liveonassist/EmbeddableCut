<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useSemanticIndex } from './use-semantic-index.svelte'

  const progress = useSemanticIndex()
</script>

<div
  data-testid="semantic-index-probe"
  data-indexing={String(progress.current.indexing)}
  data-total={String(progress.current.indexTotal)}
  data-loading={String(progress.current.loadingModel)}
></div>
