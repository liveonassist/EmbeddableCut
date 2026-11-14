// SPDX-License-Identifier: MIT

import type { ProjectFormData } from '@/features/projects/utils/validation'

export interface ProjectFormBaseProps {
  onSubmit: (data: ProjectFormData) => Promise<void> | void
  onCancel?: () => void
  defaultValues?: Partial<ProjectFormData>
  isSubmitting?: boolean
  mode: 'create' | 'edit'
  surface: 'page' | 'inline'
}

export type ProjectFormProps = Omit<ProjectFormBaseProps, 'mode' | 'surface'>
