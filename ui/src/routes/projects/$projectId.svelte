<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Navigate, type RouteComponentProps } from '@/app/router'

  let { params }: RouteComponentProps = $props()
</script>

<!-- Project settings are handled via the edit dialog on /projects/. -->
<Navigate to="/editor/$projectId" params={{ projectId: params.projectId! }} replace />
