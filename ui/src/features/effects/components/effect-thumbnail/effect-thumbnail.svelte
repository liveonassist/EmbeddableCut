<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  type EffectParams = Record<string, number | boolean | string>

  interface Props {
    effectId?: string
    effects?: ReadonlyArray<{ gpuEffectType: string; params: EffectParams }>
    active: boolean
    class?: string
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
