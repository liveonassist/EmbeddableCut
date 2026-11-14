<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import SceneCardBase from './scene-card-base.svelte'
  import type { SceneCardVariantProps } from './types'

  let { scene, match }: SceneCardVariantProps = $props()
</script>

<SceneCardBase {scene} mediaName="source" {match} />
