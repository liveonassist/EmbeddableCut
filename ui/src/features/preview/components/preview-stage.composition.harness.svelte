<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { useProxyMedia }: { useProxyMedia?: boolean } & Record<string, unknown> = $props()
</script>

<div data-testid="main-composition" data-use-proxy-media={useProxyMedia ? 'true' : 'false'}></div>
