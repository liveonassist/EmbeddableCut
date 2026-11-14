// SPDX-License-Identifier: MIT

import type { CanvasSettings } from '@/types/transform'
import type { TextItem, TextSpan } from '@/types/timeline'
import type { ItemPropertiesPreview } from '@/features/editor/deps/preview'
import { updateItem } from '@/features/editor/deps/timeline-store'
import {
  applyTextStylePresetToItem,
  buildTextStylePresetTemplate,
  type TextStylePresetId,
} from './text-style-presets'
import { TEXT_EFFECT_PRESETS } from './text-section-constants'
import type { TextSharedValues } from './text-section-shared-values'
import {
  buildSpanLayout,
  cloneTextSpans,
  getLayoutDraftKey,
  getSpanEditPlainText,
  normalizeTextShadow,
  normalizeTextStroke,
} from './text-section-utils'
import { buildTextItemLabelFromText } from '@/shared/utils/text-item-spans'
import {
  buildEditableBaseSpans,
  buildTextSingleLayoutDraft,
  cloneTextLayoutDrafts,
  getTextItemLayoutMode,
} from '@/shared/utils/text-layout-drafts'

export interface TextSectionHandlerParams {
  textItems: TextItem[]
  /** Ids of {@link textItems}. */
  itemIds: string[]
  sharedValues: TextSharedValues | null
  /** First item's shadow, filled in with the empty template. */
  baseShadow: NonNullable<TextItem['textShadow']>
  /** First item's stroke, filled in with the empty template. */
  baseStroke: NonNullable<TextItem['stroke']>
  /** Spans the span editors edit: the shared ones, else the first item's. */
  activeEditorSpans: TextSpan[]
  firstTextItem: TextItem | undefined
  supportedFontWeightOptions: readonly { readonly value: TextItem['fontWeight'] }[]
  canvas: CanvasSettings
  /** Gizmo preview sink for live drag feedback. */
  setPropertiesPreviewNew: (previews: Record<string, ItemPropertiesPreview>) => void
  clearPreview: () => void
}

/**
 * Every mutation the text inspector performs, with its live-preview twin.
 * Collaborators are injected so the section owns the store subscriptions; `params`
 * is read on every call, so each handler sees the latest selection.
 */
export function useTextSectionHandlers(params: () => TextSectionHandlerParams) {
  const updateTextItems = (updates: Partial<TextItem>) => {
    params().textItems.forEach((item) => {
      updateItem(item.id, updates)
    })
  }

  const setTextPropertiesPreview = (properties: ItemPropertiesPreview) => {
    const previews: Record<string, ItemPropertiesPreview> = {}
    params().itemIds.forEach((id) => {
      previews[id] = properties
    })
    params().setPropertiesPreviewNew(previews)
  }

  const setSpanPreview = (
    nextSpans: TextSpan[] | undefined,
    options?: {
      collapseToSingle?: boolean
    },
  ) => {
    const sanitizedSpans = nextSpans ? cloneTextSpans(nextSpans) : undefined
    const plainText = getSpanEditPlainText({
      sanitizedSpans,
      collapseToSingle: options?.collapseToSingle ?? false,
      activeEditorSpans: params().activeEditorSpans,
      firstTextItem: params().firstTextItem,
      sharedText: params().sharedValues?.text,
    })
    setTextPropertiesPreview({
      text: plainText,
      textSpans: sanitizedSpans,
    })
  }

  const finalizePreviewChange = () => {
    queueMicrotask(() => params().clearPreview())
  }

  const updateTextItemsFromSpans = (
    nextSpans: TextSpan[] | undefined,
    options?: {
      collapseToSingle?: boolean
    },
  ) => {
    const sanitizedSpans = nextSpans ? cloneTextSpans(nextSpans) : undefined
    const plainText = getSpanEditPlainText({
      sanitizedSpans,
      collapseToSingle: options?.collapseToSingle ?? false,
      activeEditorSpans: params().activeEditorSpans,
      firstTextItem: params().firstTextItem,
      sharedText: params().sharedValues?.text,
    })
    const label = buildTextItemLabelFromText(plainText)
    params().textItems.forEach((item) => {
      updateItem(item.id, {
        text: plainText,
        textSpans: sanitizedSpans,
        label,
      })
    })
  }

  // Handlers
  const handleTextChange = (e: Event & { currentTarget: EventTarget & HTMLTextAreaElement }) => {
    const newText = e.currentTarget.value
    params().textItems.forEach((item) => {
      updateItem(item.id, {
        text: newText,
        textSpans: undefined,
        label: buildTextItemLabelFromText(newText),
      })
    })
  }

  const handleApplySpanLayout = (layout: 'single' | 'two' | 'three') => {
    params().textItems.forEach((item) => {
      const currentLayout = getTextItemLayoutMode(item)
      const nextDrafts = cloneTextLayoutDrafts(item.textLayoutDrafts) ?? {}

      if (currentLayout === 'single') {
        nextDrafts.single = buildTextSingleLayoutDraft(item)
      } else {
        nextDrafts[getLayoutDraftKey(currentLayout)] = cloneTextSpans(item.textSpans ?? [])
      }

      if (layout === 'single') {
        const singleDraft = nextDrafts.single ?? buildTextSingleLayoutDraft(item)
        updateItem(item.id, {
          text: singleDraft.text,
          textSpans: undefined,
          label: buildTextItemLabelFromText(singleDraft.text),
          fontSize: singleDraft.fontSize,
          fontFamily: singleDraft.fontFamily,
          fontWeight: singleDraft.fontWeight,
          fontStyle: singleDraft.fontStyle,
          underline: singleDraft.underline,
          color: singleDraft.color ?? item.color,
          letterSpacing: singleDraft.letterSpacing,
          textLayoutDrafts: nextDrafts,
        })
        return
      }

      const draftKey = getLayoutDraftKey(layout)
      const nextSpans = buildSpanLayout(
        nextDrafts[draftKey] ?? buildEditableBaseSpans(item),
        item,
        layout === 'two' ? 2 : 3,
      )
      updateItem(item.id, {
        text: nextSpans.map((span) => span.text).join('\n'),
        textSpans: nextSpans,
        label: buildTextItemLabelFromText(nextSpans.map((span) => span.text).join('\n')),
        textLayoutDrafts: nextDrafts,
      })
    })
  }

  const handleSpanTextChange = (index: number, value: string) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      text: value,
    }
    updateTextItemsFromSpans(nextSpans)
  }

  const handleSpanFontSizeChange = (index: number, value: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      fontSize: value,
    }
    updateTextItemsFromSpans(nextSpans)
    finalizePreviewChange()
  }

  const handleSpanFontSizeLiveChange = (index: number, value: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      fontSize: value,
    }
    setSpanPreview(nextSpans)
  }

  const handleSpanLetterSpacingChange = (index: number, value: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      letterSpacing: value,
    }
    updateTextItemsFromSpans(nextSpans)
    finalizePreviewChange()
  }

  const handleSpanLetterSpacingLiveChange = (index: number, value: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      letterSpacing: value,
    }
    setSpanPreview(nextSpans)
  }

  const handleSpanFontFamilyChange = (index: number, value: string) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      fontFamily: value,
    }
    updateTextItemsFromSpans(nextSpans)
    finalizePreviewChange()
  }

  const handleSpanColorChange = (index: number, value: string) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      color: value,
    }
    updateTextItemsFromSpans(nextSpans)
    finalizePreviewChange()
  }

  const handleSpanColorLiveChange = (index: number, value: string) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      color: value,
    }
    setSpanPreview(nextSpans)
  }

  const handleSpanWeightChange = (index: number, value: string) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    nextSpans[index] = {
      ...(nextSpans[index] ?? { text: '' }),
      fontWeight: value as TextSpan['fontWeight'],
    }
    updateTextItemsFromSpans(nextSpans)
  }

  const handleSpanItalicToggle = (index: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    const current = nextSpans[index]
    nextSpans[index] = {
      ...(current ?? { text: '' }),
      fontStyle: current?.fontStyle === 'italic' ? 'normal' : 'italic',
    }
    updateTextItemsFromSpans(nextSpans)
  }

  const handleSpanUnderlineToggle = (index: number) => {
    const nextSpans = cloneTextSpans(params().activeEditorSpans)
    const current = nextSpans[index]
    nextSpans[index] = {
      ...(current ?? { text: '' }),
      underline: !(current?.underline ?? params().firstTextItem?.underline ?? false),
    }
    updateTextItemsFromSpans(nextSpans)
  }

  // Live preview for fontSize (during drag)
  const handleFontSizeLiveChange = (value: number) => {
    setTextPropertiesPreview({ fontSize: value })
  }

  // Commit fontSize (on mouse up)
  const handleFontSizeChange = (value: number) => {
    updateTextItems({ fontSize: value })
    finalizePreviewChange()
  }

  const handleFontFamilyChange = (value: string) => {
    updateTextItems({ fontFamily: value })
  }

  const handleFontWeightChange = (value: string) => {
    if (!params().supportedFontWeightOptions.some((weight) => weight.value === value)) {
      return
    }
    updateTextItems({ fontWeight: value as TextItem['fontWeight'] })
  }

  const handleBoldToggle = () => {
    if (!params().supportedFontWeightOptions.some((weight) => weight.value === 'bold')) {
      return
    }
    const nextWeight: TextItem['fontWeight'] =
      params().sharedValues?.fontWeight === 'bold' ? 'normal' : 'bold'
    updateTextItems({ fontWeight: nextWeight })
  }

  const handleItalicToggle = () => {
    const nextStyle: TextItem['fontStyle'] =
      params().sharedValues?.fontStyle === 'italic' ? 'normal' : 'italic'
    updateTextItems({ fontStyle: nextStyle })
  }

  const handleUnderlineToggle = () => {
    updateTextItems({ underline: !(params().sharedValues?.underline ?? false) })
  }

  // Live preview for color (during picker drag)
  const handleColorLiveChange = (value: string) => {
    setTextPropertiesPreview({ color: value })
  }

  // Commit color (on picker close)
  const handleColorChange = (value: string) => {
    updateTextItems({ color: value })
    finalizePreviewChange()
  }

  const handleBackgroundColorLiveChange = (value: string) => {
    setTextPropertiesPreview({ backgroundColor: value })
  }

  const handleBackgroundColorChange = (value: string) => {
    updateTextItems({ backgroundColor: value })
    finalizePreviewChange()
  }

  const handleBackgroundColorClear = () => {
    updateTextItems({ backgroundColor: undefined })
    finalizePreviewChange()
  }

  const handleBackgroundRadiusLiveChange = (value: number) => {
    setTextPropertiesPreview({ backgroundRadius: value })
  }

  const handleBackgroundRadiusChange = (value: number) => {
    updateTextItems({ backgroundRadius: value })
    finalizePreviewChange()
  }

  const handleTextAlignChange = (value: string) => {
    updateTextItems({ textAlign: value as TextItem['textAlign'] })
  }

  const handleVerticalAlignChange = (value: string) => {
    updateTextItems({ verticalAlign: value as TextItem['verticalAlign'] })
  }

  // Live preview for letterSpacing (during drag)
  const handleLetterSpacingLiveChange = (value: number) => {
    setTextPropertiesPreview({ letterSpacing: value })
  }

  // Commit letterSpacing (on mouse up)
  const handleLetterSpacingChange = (value: number) => {
    updateTextItems({ letterSpacing: value })
    finalizePreviewChange()
  }

  // Live preview for lineHeight (during drag)
  const handleLineHeightLiveChange = (value: number) => {
    setTextPropertiesPreview({ lineHeight: value })
  }

  // Commit lineHeight (on mouse up)
  const handleLineHeightChange = (value: number) => {
    updateTextItems({ lineHeight: value })
    finalizePreviewChange()
  }

  const handleTextPaddingLiveChange = (value: number) => {
    setTextPropertiesPreview({ textPadding: value })
  }

  const handleTextPaddingChange = (value: number) => {
    updateTextItems({ textPadding: value })
    finalizePreviewChange()
  }

  const handleShadowColorLiveChange = (value: string) => {
    setTextPropertiesPreview({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        color: value,
      }),
    })
  }

  const handleShadowColorChange = (value: string) => {
    updateTextItems({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        color: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleShadowOffsetXLiveChange = (value: number) => {
    setTextPropertiesPreview({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        offsetX: value,
      }),
    })
  }

  const handleShadowOffsetXChange = (value: number) => {
    updateTextItems({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        offsetX: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleShadowOffsetYLiveChange = (value: number) => {
    setTextPropertiesPreview({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        offsetY: value,
      }),
    })
  }

  const handleShadowOffsetYChange = (value: number) => {
    updateTextItems({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        offsetY: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleShadowBlurLiveChange = (value: number) => {
    setTextPropertiesPreview({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        blur: value,
      }),
    })
  }

  const handleShadowBlurChange = (value: number) => {
    updateTextItems({
      textShadow: normalizeTextShadow({
        ...params().baseShadow,
        blur: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleStrokeWidthLiveChange = (value: number) => {
    setTextPropertiesPreview({
      stroke: normalizeTextStroke({
        ...params().baseStroke,
        width: value,
      }),
    })
  }

  const handleStrokeWidthChange = (value: number) => {
    updateTextItems({
      stroke: normalizeTextStroke({
        ...params().baseStroke,
        width: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleStrokeColorLiveChange = (value: string) => {
    setTextPropertiesPreview({
      stroke: normalizeTextStroke({
        ...params().baseStroke,
        color: value,
      }),
    })
  }

  const handleStrokeColorChange = (value: string) => {
    updateTextItems({
      stroke: normalizeTextStroke({
        ...params().baseStroke,
        color: value,
      }),
    })
    finalizePreviewChange()
  }

  const handleApplyTextEffectPreset = (presetId: (typeof TEXT_EFFECT_PRESETS)[number]['id']) => {
    const preset = TEXT_EFFECT_PRESETS.find((entry) => entry.id === presetId)
    if (!preset) {
      return
    }

    const effectColor = params().sharedValues?.color ?? params().textItems[0]?.color ?? '#ffffff'
    updateTextItems(preset.getUpdates(effectColor))
    finalizePreviewChange()
  }

  const handleApplyTextStylePreset = (presetId: TextStylePresetId) => {
    params().textItems.forEach((item) => {
      updateItem(item.id, buildTextStylePresetTemplate(presetId, params().canvas, 1))
    })
    finalizePreviewChange()
  }

  const handleTextStyleScaleChange = (value: number) => {
    params().textItems.forEach((item) => {
      if (!item.textStylePresetId) {
        return
      }

      updateItem(
        item.id,
        applyTextStylePresetToItem(item, item.textStylePresetId, params().canvas, value),
      )
    })
    finalizePreviewChange()
  }

  return {
    updateTextItems,
    setTextPropertiesPreview,
    setSpanPreview,
    finalizePreviewChange,
    updateTextItemsFromSpans,
    handleTextChange,
    handleApplySpanLayout,
    handleSpanTextChange,
    handleSpanFontSizeChange,
    handleSpanFontSizeLiveChange,
    handleSpanLetterSpacingChange,
    handleSpanLetterSpacingLiveChange,
    handleSpanFontFamilyChange,
    handleSpanColorChange,
    handleSpanColorLiveChange,
    handleSpanWeightChange,
    handleSpanItalicToggle,
    handleSpanUnderlineToggle,
    handleFontSizeLiveChange,
    handleFontSizeChange,
    handleFontFamilyChange,
    handleFontWeightChange,
    handleBoldToggle,
    handleItalicToggle,
    handleUnderlineToggle,
    handleColorLiveChange,
    handleColorChange,
    handleBackgroundColorLiveChange,
    handleBackgroundColorChange,
    handleBackgroundColorClear,
    handleBackgroundRadiusLiveChange,
    handleBackgroundRadiusChange,
    handleTextAlignChange,
    handleVerticalAlignChange,
    handleLetterSpacingLiveChange,
    handleLetterSpacingChange,
    handleLineHeightLiveChange,
    handleLineHeightChange,
    handleTextPaddingLiveChange,
    handleTextPaddingChange,
    handleShadowColorLiveChange,
    handleShadowColorChange,
    handleShadowOffsetXLiveChange,
    handleShadowOffsetXChange,
    handleShadowOffsetYLiveChange,
    handleShadowOffsetYChange,
    handleShadowBlurLiveChange,
    handleShadowBlurChange,
    handleStrokeWidthLiveChange,
    handleStrokeWidthChange,
    handleStrokeColorLiveChange,
    handleStrokeColorChange,
    handleApplyTextEffectPreset,
    handleApplyTextStylePreset,
    handleTextStyleScaleChange,
  }
}
