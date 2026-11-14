<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ErrorComponentProps } from './types'

  let { error }: ErrorComponentProps = $props()
</script>

<p>failed: {(error as Error).message}</p>
