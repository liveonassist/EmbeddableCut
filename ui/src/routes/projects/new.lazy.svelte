<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('NewProject')
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Link, useNavigate } from '$lib/router'
  import { InlineCreateProjectForm } from '@/features/projects/components/project-form'
  import { useCreateProject } from '@/features/projects/hooks/use-project-actions.svelte'
  import EmbeddableCutLogo from '@/components/brand/embeddablecut-logo.svelte'
  import type { ProjectFormData } from '@/features/projects/utils/validation'
  import { t } from '$lib/i18n.svelte'

  const navigate = useNavigate()
  let isSubmitting = $state(false)
  const createProject = useCreateProject()

  async function handleSubmit(data: ProjectFormData) {
    isSubmitting = true

    try {
      const result = await createProject(data)

      if (result.success && result.project) {
        // Navigate to editor with new project
        void navigate({
          to: '/editor/$projectId',
          params: { projectId: result.project.id },
        })
      } else {
        toast.error(t('projects.toasts.createFailed'), { description: result.error ?? undefined })
        isSubmitting = false
      }
    } catch (error) {
      logger.error('Failed to create project:', error)
      toast.error(t('projects.toasts.createFailed'), { description: t('projects.tryAgain') })
      isSubmitting = false
    }
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="panel-header border-b border-border">
    <div class="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
      <Link to="/">
        <EmbeddableCutLogo variant="full" size="md" class="hover:opacity-80 transition-opacity" />
      </Link>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-7xl mx-auto px-6 py-8">
    <InlineCreateProjectForm onSubmit={handleSubmit} {isSubmitting} />
  </div>
</div>
