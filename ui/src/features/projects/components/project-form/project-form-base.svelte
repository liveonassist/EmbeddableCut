<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { PROJECT_TEMPLATES, type ProjectFormData } from '@/features/projects/utils/validation'

  type FieldName = keyof ProjectFormData
  type FieldErrors = Partial<Record<FieldName, string>>

  const matchTemplateId = (width: number, height: number) =>
    PROJECT_TEMPLATES.find((t) => t.width === width && t.height === height)?.id ?? 'custom'
</script>

<script lang="ts">
  /**
   * The project form. Validation is react-hook-form's `onChange` mode over the
   * zod schema: a field shows its error once it changes, the submit button
   * waits for the whole form to be valid, and submitting shows every error.
   */
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { Separator } from '@/components/ui/separator'
  import { Link } from '@/app/router'
  import {
    createProjectFormSchema,
    type ProjectTemplate,
    DEFAULT_PROJECT_VALUES,
  } from '@/features/projects/utils/validation'
  import { getProjectFpsOptions } from '@/features/projects/utils/project-fps'
  import { t } from '$lib/i18n.svelte'
  import ProjectTemplatePicker from '../project-template-picker.svelte'
  import type { ProjectFormBaseProps } from './types'

  let {
    onSubmit,
    onCancel,
    defaultValues,
    isSubmitting = false,
    mode,
    surface,
  }: ProjectFormBaseProps = $props()

  const isEditing = $derived(mode === 'edit')
  const isInlineSurface = $derived(surface === 'inline')
  const resolvedDefaultValues = $derived({
    ...DEFAULT_PROJECT_VALUES,
    ...defaultValues,
  })
  const validationSchema = $derived(createProjectFormSchema((key) => t(key)))

  // svelte-ignore state_referenced_locally
  let values = $state<ProjectFormData>({ ...resolvedDefaultValues })
  let errors = $state<FieldErrors>({})
  // svelte-ignore state_referenced_locally
  let selectedTemplateId = $state<string | undefined>(
    matchTemplateId(resolvedDefaultValues.width, resolvedDefaultValues.height),
  )

  const parsed = $derived(validationSchema.safeParse(values))
  const isValid = $derived(parsed.success)

  // Reset to new default values (react-hook-form's `reset(defaultValues)`).
  $effect.pre(() => {
    const next = resolvedDefaultValues
    values = { ...next }
    errors = {}
    selectedTemplateId = matchTemplateId(next.width, next.height)
  })

  function fieldError(name: FieldName): string | undefined {
    const result = validationSchema.safeParse(values)
    if (result.success) return undefined
    return result.error.issues.find((issue) => issue.path[0] === name)?.message
  }

  function setValue<K extends FieldName>(name: K, value: ProjectFormData[K]) {
    values[name] = value
    errors[name] = fieldError(name)
  }

  const fps = $derived(values.fps)
  const fpsOptions = $derived(getProjectFpsOptions(fps))

  function handleSelectTemplate(template: ProjectTemplate) {
    selectedTemplateId = template.id
    setValue('width', template.width)
    setValue('height', template.height)
    setValue('fps', template.fps)
  }

  function handleCustomSelect() {
    selectedTemplateId = 'custom'
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const result = validationSchema.safeParse(values)
    if (!result.success) {
      const next: FieldErrors = {}
      for (const issue of result.error.issues) {
        const name = issue.path[0] as FieldName
        next[name] ??= issue.message
      }
      errors = next
      return
    }
    errors = {}
    await onSubmit(result.data)
  }
</script>

<div class="bg-background">
  <!-- Header -->
  {#if !isInlineSurface}
    <div class="panel-header border-b border-border">
      <div class="max-w-[1400px] mx-auto px-6 py-5">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground mb-1">
          {isEditing ? t('projects.form.editTitle') : t('projects.form.createTitle')}
        </h1>
        <p class="text-sm text-muted-foreground">
          {isEditing ? t('projects.form.editSubtitle') : t('projects.form.createSubtitle')}
        </p>
      </div>
    </div>
  {/if}

  <!-- Form -->
  <div class={isInlineSurface ? '' : 'max-w-[1400px] mx-auto px-6 py-8'}>
    <form onsubmit={(e) => void handleSubmit(e)} class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-6 items-start">
        <!-- Project Details -->
        <div
          class={`panel-bg border border-border rounded-lg p-6 ${isInlineSurface ? '' : 'lg:sticky lg:top-6'}`}
        >
          <div class="flex items-center gap-3 mb-6">
            <div class="h-8 w-1 bg-primary rounded-full"></div>
            <h2 class="text-lg font-medium text-foreground">
              {t('projects.form.projectDetails')}
            </h2>
          </div>

          <div class="space-y-5">
            <!-- Project Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-foreground mb-2">
                {t('projects.form.projectName')} <span class="text-destructive">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={values.name}
                oninput={(e) => setValue('name', e.currentTarget.value)}
                class="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[color,border-color,box-shadow] duration-150"
                placeholder={t('projects.form.projectNamePlaceholder')}
              />
              {#if errors.name}
                <p class="mt-1.5 text-sm text-destructive">{errors.name}</p>
              {/if}
            </div>

            <!-- Description -->
            <div>
              <label for="description" class="block text-sm font-medium text-foreground mb-2">
                {t('projects.form.description')}
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                value={values.description ?? ''}
                oninput={(e) => setValue('description', e.currentTarget.value)}
                class="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[color,border-color,box-shadow] duration-150 resize-none"
                placeholder={t('projects.form.descriptionPlaceholder')}
              ></textarea>
              {#if errors.description}
                <p class="mt-1.5 text-sm text-destructive">{errors.description}</p>
              {/if}
            </div>

            <!-- Frame Rate -->
            <div>
              <label for="fps" class="block text-sm font-medium text-foreground mb-2">
                {t('projects.form.frameRate')}
              </label>
              <Select
                value={fps.toString()}
                onValueChange={(value) => setValue('fps', Number(value))}
              >
                <SelectTrigger id="fps">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {#each fpsOptions as preset (preset.value)}
                    <SelectItem value={preset.value.toString()}>
                      {preset.label}
                    </SelectItem>
                  {/each}
                </SelectContent>
              </Select>
              {#if errors.fps}
                <p class="mt-1.5 text-sm text-destructive">{errors.fps}</p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Video Settings -->
        <div class="panel-bg border border-border rounded-lg p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="h-8 w-1 bg-primary rounded-full"></div>
            <h2 class="text-lg font-medium text-foreground">
              {t('projects.form.resolution')}
            </h2>
          </div>

          <ProjectTemplatePicker
            {selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onSelectCustom={handleCustomSelect}
          />
          {#if selectedTemplateId === 'custom'}
            <div class="mt-5 flex items-center gap-3">
              <div class="flex-1">
                <label for="width" class="block text-xs font-medium text-muted-foreground mb-1">
                  {t('projects.form.widthPx')}
                </label>
                <input
                  id="width"
                  name="width"
                  type="number"
                  value={values.width}
                  oninput={(e) => setValue('width', e.currentTarget.valueAsNumber)}
                  class="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[color,border-color,box-shadow] duration-150"
                  placeholder="1920"
                  min={320}
                />
                {#if errors.width}
                  <p class="mt-1 text-xs text-destructive">{errors.width}</p>
                {/if}
              </div>
              <span class="text-muted-foreground mt-4">×</span>
              <div class="flex-1">
                <label for="height" class="block text-xs font-medium text-muted-foreground mb-1">
                  {t('projects.form.heightPx')}
                </label>
                <input
                  id="height"
                  name="height"
                  type="number"
                  value={values.height}
                  oninput={(e) => setValue('height', e.currentTarget.valueAsNumber)}
                  class="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[color,border-color,box-shadow] duration-150"
                  placeholder="1080"
                  min={240}
                />
                {#if errors.height}
                  <p class="mt-1 text-xs text-destructive">{errors.height}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <Separator />

      <!-- Actions -->
      <div class="flex gap-3 justify-end">
        {#if onCancel}
          <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onclick={onCancel}>
            {t('common.cancel')}
          </Button>
        {:else}
          <Link to="/projects">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
          </Link>
        {/if}
        <Button type="submit" size="lg" class="min-w-[160px]" disabled={!isValid || isSubmitting}>
          {isSubmitting
            ? t('common.saving')
            : isEditing
              ? t('projects.form.updateProject')
              : t('projects.form.createProject')}
        </Button>
      </div>
    </form>
  </div>
</div>
