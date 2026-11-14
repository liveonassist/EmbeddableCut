<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('NewProject')
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner'
  import Github from 'lucide-svelte/icons/github'
  import { Link, useNavigate } from '@/app/router'
  import { InlineCreateProjectForm } from '@/features/projects/components/project-form'
  import { useCreateProject } from '@/features/projects/hooks/use-project-actions.svelte'
  import FreeCutLogo from '@/components/brand/freecut-logo.svelte'
  import DiscordIcon from '@/components/brand/discord-icon.svelte'
  import { Button } from '@/components/ui/button'
  import { DISCORD_INVITE_URL } from '@/config/community'
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
        <FreeCutLogo variant="full" size="md" class="hover:opacity-80 transition-opacity" />
      </Link>
      <div class="flex items-center gap-3">
        <Button variant="outline" size="lg" class="gap-2">
          {#snippet child({ props })}
            <a {...props} href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
              <DiscordIcon class="w-4 h-4" />
              Discord
            </a>
          {/snippet}
        </Button>
        <Button variant="outline" size="icon" class="h-10 w-10">
          {#snippet child({ props })}
            <a
              {...props}
              href="https://github.com/walterlow/freecut"
              target="_blank"
              rel="noopener noreferrer"
              data-tooltip={t('projects.viewOnGitHub')}
              data-tooltip-side="left"
            >
              <Github class="w-5 h-5" />
            </a>
          {/snippet}
        </Button>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-7xl mx-auto px-6 py-8">
    <InlineCreateProjectForm onSubmit={handleSubmit} {isSubmitting} />
  </div>
</div>
