<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { RouteComponentProps } from './types'

  let { params, loaderData }: RouteComponentProps = $props()
</script>

<p>{window.location.pathname} {JSON.stringify(params)} {JSON.stringify(loaderData ?? null)}</p>
