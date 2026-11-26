<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus'
  import {
    PROJECT_TEMPLATES,
    getAspectRatio,
    type ProjectTemplate,
  } from '@/features/projects/utils/validation'
  import { t } from '$lib/i18n.svelte'

  interface ProjectTemplatePickerProps {
    onSelectTemplate: (template: ProjectTemplate) => void
    selectedTemplateId?: string | 'custom'
    onSelectCustom?: () => void
  }

  let { onSelectTemplate, selectedTemplateId, onSelectCustom }: ProjectTemplatePickerProps =
    $props()

  const isCustomSelected = $derived(selectedTemplateId === 'custom')
</script>

<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
  {#each PROJECT_TEMPLATES as template (template.id)}
    {@const isSelected = selectedTemplateId === template.id}
    {@const aspectRatio = getAspectRatio(template.width, template.height)}
    {@const resolution = `${template.width}×${template.height}`}
    <button
      type="button"
      aria-pressed={isSelected}
      onclick={() => onSelectTemplate(template)}
      class={`group relative flex flex-col gap-3 p-4 panel-bg border rounded-lg transition-[transform,border-color,box-shadow] duration-150 active:scale-[0.98] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      }`}
    >
      <!-- Silhouette Container -->
      <div
        class="relative h-24 bg-secondary/30 rounded overflow-hidden flex items-center justify-center"
        style:container-type="size"
      >
        <!-- Aspect Ratio Silhouette -->
        <div
          class={`bg-primary/20 border-2 border-dashed rounded-sm ${
            isSelected ? 'border-primary' : 'border-primary/40'
          }`}
          style:aspect-ratio={`${template.width} / ${template.height}`}
          style:width={`min(100cqw, ${(template.width / template.height) * 100}cqh)`}
          style:height={`min(100cqh, ${(template.height / template.width) * 100}cqw)`}
        ></div>
      </div>

      <!-- Template Info -->
      <div class="flex-1 text-left">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {template.platform}
        </p>
        <h3
          class="font-medium text-sm text-foreground group-hover:text-primary transition-colors mt-1"
        >
          {template.name}
        </h3>
        <p class="text-xs text-muted-foreground mt-2">
          {resolution}<span class="mx-1">•</span>{aspectRatio}
        </p>
      </div>
    </button>
  {/each}
  {#if onSelectCustom}
    <button
      type="button"
      aria-pressed={isCustomSelected}
      onclick={onSelectCustom}
      class={`group relative flex flex-col gap-3 p-4 panel-bg border rounded-lg transition-[transform,border-color,box-shadow] duration-150 active:scale-[0.98] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
        isCustomSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      }`}
    >
      <div
        class="relative h-24 bg-secondary/30 rounded overflow-hidden flex items-center justify-center"
      >
        <div
          class={`border-2 border-dashed rounded-sm transition-colors ${
            isCustomSelected
              ? 'border-primary/70 bg-primary/10'
              : 'border-muted-foreground/30 bg-muted/10'
          }`}
          style="aspect-ratio: 4 / 3; height: 80%; max-width: 80%"
        ></div>
        <Plus
          class={`absolute w-5 h-5 transition-colors ${
            isCustomSelected ? 'text-primary' : 'text-muted-foreground/60'
          }`}
        />
      </div>
      <div class="flex-1 text-left">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('projects.templatePicker.custom')}
        </p>
        <h3
          class={`font-medium text-sm transition-colors mt-1 ${
            isCustomSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'
          }`}
        >
          {t('projects.templatePicker.customSize')}
        </h3>
        <p class="text-xs text-muted-foreground mt-2">
          {t('projects.templatePicker.enterDimensions')}
        </p>
      </div>
    </button>
  {/if}
</div>
