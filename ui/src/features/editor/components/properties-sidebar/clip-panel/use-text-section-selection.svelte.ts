// SPDX-License-Identifier: MIT

import type { TextItem, TextSpan, TimelineItem } from '@/types/timeline'
import { FONT_CATALOG } from '@/shared/typography/fonts'
import { getTextItemSpans } from '@/shared/utils/text-item-spans'
import {
  EMPTY_TEXT_SHADOW,
  EMPTY_TEXT_STROKE,
  FONT_WEIGHT_OPTIONS,
  FONT_WEIGHT_VALUES,
  type FontWeightOption,
} from './text-section-constants'
import { areTextSpansEqual } from './text-section-utils'
import { getSharedTextValues, type TextSharedValues } from './text-section-shared-values'

export interface TextSectionSelection {
  readonly textItems: TextItem[]
  /** Ids of {@link textItems}. */
  readonly itemIds: string[]
  readonly sharedValues: TextSharedValues | null
  /** The first item's shadow/stroke, filled in with the empty template. */
  readonly baseShadow: NonNullable<TextItem['textShadow']>
  readonly baseStroke: NonNullable<TextItem['stroke']>
  /** Spans every selected item agrees on, or `undefined` when they differ. */
  readonly sharedTextSpans: TextSpan[] | undefined
  /** The spans the span editors edit: the shared ones, else the first item's. */
  readonly activeEditorSpans: TextSpan[]
  readonly firstTextItem: TextItem | undefined
  readonly hasStructuredSpanEditor: boolean
  /** Weights the selected font actually ships, falling back to the full list. */
  readonly supportedFontWeightOptions: readonly FontWeightOption[]
}

/** Everything the text inspector derives from the current selection. */
export function useTextSectionSelection(items: () => TimelineItem[]): TextSectionSelection {
  // Filter to only text items
  const textItems = $derived(items().filter((item): item is TextItem => item.type === 'text'))

  const itemIds = $derived(textItems.map((item) => item.id))
  const baseShadow = $derived({ ...EMPTY_TEXT_SHADOW, ...(textItems[0]?.textShadow ?? {}) })
  const baseStroke = $derived({ ...EMPTY_TEXT_STROKE, ...(textItems[0]?.stroke ?? {}) })
  const sharedTextSpans = $derived.by(() => {
    if (textItems.length === 0) return undefined
    const first = getTextItemSpans(textItems[0]!)
    return textItems.every((item) => areTextSpansEqual(getTextItemSpans(item), first))
      ? first
      : undefined
  })
  const activeEditorSpans = $derived(
    sharedTextSpans ?? (textItems[0] ? getTextItemSpans(textItems[0]) : []),
  )
  const firstTextItem = $derived(textItems[0])
  const hasStructuredSpanEditor = $derived(Boolean(firstTextItem?.textSpans?.length))

  // Get shared values across selected text items
  const sharedValues = $derived(getSharedTextValues(textItems))
  const selectedFontFamily = $derived(sharedValues?.fontFamily)

  const supportedFontWeightOptions = $derived.by((): readonly FontWeightOption[] => {
    const fontFamily = selectedFontFamily
    if (!fontFamily) {
      return FONT_WEIGHT_OPTIONS
    }

    const selectedFont = FONT_CATALOG.find(
      (font) => font.family === fontFamily || font.value === fontFamily,
    )
    if (!selectedFont) {
      return FONT_WEIGHT_OPTIONS
    }

    const options = FONT_WEIGHT_OPTIONS.filter((weight) =>
      selectedFont.weights.includes(FONT_WEIGHT_VALUES[weight.value]),
    )

    return options.length > 0 ? options : FONT_WEIGHT_OPTIONS
  })

  return {
    get textItems() {
      return textItems
    },
    get itemIds() {
      return itemIds
    },
    get sharedValues() {
      return sharedValues
    },
    get baseShadow() {
      return baseShadow
    },
    get baseStroke() {
      return baseStroke
    },
    get sharedTextSpans() {
      return sharedTextSpans
    },
    get activeEditorSpans() {
      return activeEditorSpans
    },
    get firstTextItem() {
      return firstTextItem
    },
    get hasStructuredSpanEditor() {
      return hasStructuredSpanEditor
    },
    get supportedFontWeightOptions() {
      return supportedFontWeightOptions
    },
  }
}
