<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Renders nothing: the stand-in for a mocked component that React's tests replaced with `() => null`.
  let props: Record<string, unknown> = $props()
  void props
</script>
