<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ProjectFormBase from './project-form-base.svelte'
  import type { ProjectFormProps } from './types'

  let props: ProjectFormProps = $props()
</script>

<ProjectFormBase {...props} mode="edit" surface="inline" />
