<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import Type from '@lucide/svelte/icons/type'
  import Palette from '@lucide/svelte/icons/palette'
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import { KeyframeToggle } from '@/features/editor/deps/keyframes'
  import TextMotionSlotRows from '../../../text-motion/text-motion-slot-rows.svelte'
  import { PropertySection, PropertyRow, SliderInput } from '../../components'
  import { getTextItemPlainText } from '@/shared/utils/text-item-spans'
  import { useTextSectionSelection } from '../use-text-section-selection.svelte'
  import { useTextSectionHandlers } from '../use-text-section-handlers.svelte'
  import TextTypographyControls from '../text-typography-controls.svelte'
  import { TextLayoutControls, TextPlainEditor, TextSpanEditors } from '../text-content-controls'
  import TextAlignControls from '../text-align-controls.svelte'
  import TextColorControls from '../text-color-controls.svelte'
  import TextBoxControls from '../text-box-controls.svelte'
  import TextEffectsControls from '../text-effects-controls.svelte'
  import type { TextSectionComposerProps } from './types'

  let { items, canvas, slots }: TextSectionComposerProps = $props()

  // Gizmo store for live property preview
  const setPropertiesPreviewNew = select(useGizmoStore, (s) => s.setPropertiesPreviewNew)
  const clearPreview = select(useGizmoStore, (s) => s.clearPreview)

  const selection = useTextSectionSelection(() => items)

  const handlers = useTextSectionHandlers(() => ({
    textItems: selection.textItems,
    itemIds: selection.itemIds,
    sharedValues: selection.sharedValues,
    baseShadow: selection.baseShadow,
    baseStroke: selection.baseStroke,
    activeEditorSpans: selection.activeEditorSpans,
    firstTextItem: selection.firstTextItem,
    supportedFontWeightOptions: selection.supportedFontWeightOptions,
    canvas,
    setPropertiesPreviewNew: setPropertiesPreviewNew.current,
    clearPreview: clearPreview.current,
  }))

  let previousFontFamily = untrack(() => selection.sharedValues?.fontFamily)

  $effect(() => {
    const currentFontFamily = selection.sharedValues?.fontFamily
    const supportedFontWeightOptions = selection.supportedFontWeightOptions
    untrack(() => {
      if (previousFontFamily === currentFontFamily) {
        return
      }

      previousFontFamily = currentFontFamily

      const currentWeight = selection.sharedValues?.fontWeight
      if (!currentWeight) {
        return
      }

      if (supportedFontWeightOptions.some((weight) => weight.value === currentWeight)) {
        return
      }

      const fallbackWeight = supportedFontWeightOptions[0]?.value
      if (!fallbackWeight) {
        return
      }

      handlers.updateTextItems({ fontWeight: fallbackWeight })
    })
  })

  const textItems = $derived(selection.textItems)
  const itemIds = $derived(selection.itemIds)
  const sharedValues = $derived(selection.sharedValues)
  const firstTextItem = $derived(selection.firstTextItem)
  const activeEditorSpans = $derived(selection.activeEditorSpans)

  const fontPreviewText = $derived(
    sharedValues?.text ?? (firstTextItem ? getTextItemPlainText(firstTextItem) : ''),
  )
  const backgroundColorValue = $derived(
    sharedValues?.backgroundColor || textItems[0]?.backgroundColor || '#000000',
  )
  const hasAnyBackground = $derived(textItems.some((item) => item.backgroundColor !== undefined))
  const showContentSection = $derived(slots.includes('content'))
  const showEffectSection = $derived(slots.includes('effects'))
  const showAnimationSection = $derived(slots.includes('animation'))
</script>

{#if textItems.length > 0 && sharedValues}
  {#if showContentSection}
    <PropertySection title={t('editor.textSection.sectionTitle')} icon={Type} defaultOpen={true}>
      <!-- Content editors run full-width (no gutter label) directly under
           the TEXT section header — no redundant "Content" sub-header. -->
      <div class="flex w-full min-w-0 flex-col gap-2">
        <TextLayoutControls
          hasStructuredSpans={Boolean(firstTextItem?.textSpans?.length)}
          activeSpanCount={activeEditorSpans.length}
          presetId={sharedValues.textStylePresetId}
          onApplyLayout={handlers.handleApplySpanLayout}
          onApplyStylePreset={handlers.handleApplyTextStylePreset}
        />
        {#if firstTextItem?.textSpans?.length}
          <TextSpanEditors
            spans={activeEditorSpans}
            fallbackItem={firstTextItem}
            onSpanTextChange={handlers.handleSpanTextChange}
            onSpanFontFamilyChange={handlers.handleSpanFontFamilyChange}
            onSpanFontSizeChange={handlers.handleSpanFontSizeChange}
            onSpanFontSizeLiveChange={handlers.handleSpanFontSizeLiveChange}
            onSpanWeightChange={handlers.handleSpanWeightChange}
            onSpanLetterSpacingChange={handlers.handleSpanLetterSpacingChange}
            onSpanLetterSpacingLiveChange={handlers.handleSpanLetterSpacingLiveChange}
            onSpanColorChange={handlers.handleSpanColorChange}
            onSpanColorLiveChange={handlers.handleSpanColorLiveChange}
            onSpanItalicToggle={handlers.handleSpanItalicToggle}
            onSpanUnderlineToggle={handlers.handleSpanUnderlineToggle}
          />
        {:else}
          <TextPlainEditor
            value={sharedValues.text ?? ''}
            isMixed={sharedValues.text === undefined}
            onChange={handlers.handleTextChange}
          />
        {/if}
      </div>
      {#if sharedValues.textStylePresetId}
        <PropertyRow label={t('editor.textSection.scale')}>
          <div class="flex items-center gap-1 min-w-0 w-full">
            <SliderInput
              value={sharedValues.textStyleScale}
              onChange={handlers.handleTextStyleScaleChange}
              min={0.5}
              max={6}
              step={0.05}
              unit="x"
              formatValue={(value) => `${value.toFixed(2)}x`}
              class="flex-1 min-w-0"
            />
            <KeyframeToggle
              {itemIds}
              property="textStyleScale"
              currentValue={firstTextItem?.textStyleScale ?? 1}
            />
          </div>
        </PropertyRow>
      {/if}

      <TextTypographyControls
        enabled={!selection.hasStructuredSpanEditor}
        fontFamily={sharedValues.fontFamily}
        fontSize={sharedValues.fontSize}
        fontWeight={sharedValues.fontWeight}
        fontStyle={sharedValues.fontStyle}
        underline={sharedValues.underline}
        {fontPreviewText}
        supportedFontWeightOptions={selection.supportedFontWeightOptions}
        {itemIds}
        fontSizeCurrentValue={firstTextItem?.fontSize ?? 60}
        onFontFamilyChange={handlers.handleFontFamilyChange}
        onFontSizeChange={handlers.handleFontSizeChange}
        onFontSizeLiveChange={handlers.handleFontSizeLiveChange}
        onFontWeightChange={handlers.handleFontWeightChange}
        onBoldToggle={handlers.handleBoldToggle}
        onItalicToggle={handlers.handleItalicToggle}
        onUnderlineToggle={handlers.handleUnderlineToggle}
      />

      <TextAlignControls
        textAlign={sharedValues.textAlign}
        verticalAlign={sharedValues.verticalAlign}
        onTextAlignChange={handlers.handleTextAlignChange}
        onVerticalAlignChange={handlers.handleVerticalAlignChange}
      />

      <TextColorControls
        enabled={!selection.hasStructuredSpanEditor}
        color={sharedValues.color}
        backgroundColor={backgroundColorValue}
        {hasAnyBackground}
        letterSpacing={sharedValues.letterSpacing}
        onColorChange={handlers.handleColorChange}
        onColorLiveChange={handlers.handleColorLiveChange}
        onBackgroundColorChange={handlers.handleBackgroundColorChange}
        onBackgroundColorLiveChange={handlers.handleBackgroundColorLiveChange}
        onBackgroundColorClear={handlers.handleBackgroundColorClear}
        onLetterSpacingChange={handlers.handleLetterSpacingChange}
        onLetterSpacingLiveChange={handlers.handleLetterSpacingLiveChange}
      />

      <TextBoxControls
        lineHeight={sharedValues.lineHeight}
        textPadding={sharedValues.textPadding}
        backgroundRadius={sharedValues.backgroundRadius}
        {itemIds}
        lineHeightCurrentValue={firstTextItem?.lineHeight ?? 1.2}
        textPaddingCurrentValue={firstTextItem?.textPadding ?? 16}
        backgroundRadiusCurrentValue={firstTextItem?.backgroundRadius ?? 0}
        onLineHeightChange={handlers.handleLineHeightChange}
        onLineHeightLiveChange={handlers.handleLineHeightLiveChange}
        onTextPaddingChange={handlers.handleTextPaddingChange}
        onTextPaddingLiveChange={handlers.handleTextPaddingLiveChange}
        onBackgroundRadiusChange={handlers.handleBackgroundRadiusChange}
        onBackgroundRadiusLiveChange={handlers.handleBackgroundRadiusLiveChange}
      />
    </PropertySection>
  {/if}

  {#if showEffectSection}
    <PropertySection title={t('editor.textSection.style')} icon={Palette} defaultOpen={true}>
      <TextEffectsControls
        {itemIds}
        shadowColor={sharedValues.shadowColor}
        shadowOffsetX={sharedValues.shadowOffsetX}
        shadowOffsetY={sharedValues.shadowOffsetY}
        shadowBlur={sharedValues.shadowBlur}
        strokeWidth={sharedValues.strokeWidth}
        strokeColor={sharedValues.strokeColor}
        shadowOffsetXCurrentValue={firstTextItem?.textShadow?.offsetX ?? 0}
        shadowOffsetYCurrentValue={firstTextItem?.textShadow?.offsetY ?? 0}
        shadowBlurCurrentValue={firstTextItem?.textShadow?.blur ?? 0}
        strokeWidthCurrentValue={firstTextItem?.stroke?.width ?? 0}
        onApplyPreset={handlers.handleApplyTextEffectPreset}
        onShadowColorChange={handlers.handleShadowColorChange}
        onShadowColorLiveChange={handlers.handleShadowColorLiveChange}
        onShadowOffsetXChange={handlers.handleShadowOffsetXChange}
        onShadowOffsetXLiveChange={handlers.handleShadowOffsetXLiveChange}
        onShadowOffsetYChange={handlers.handleShadowOffsetYChange}
        onShadowOffsetYLiveChange={handlers.handleShadowOffsetYLiveChange}
        onShadowBlurChange={handlers.handleShadowBlurChange}
        onShadowBlurLiveChange={handlers.handleShadowBlurLiveChange}
        onStrokeWidthChange={handlers.handleStrokeWidthChange}
        onStrokeWidthLiveChange={handlers.handleStrokeWidthLiveChange}
        onStrokeColorChange={handlers.handleStrokeColorChange}
        onStrokeColorLiveChange={handlers.handleStrokeColorLiveChange}
      />
    </PropertySection>
  {/if}

  {#if showAnimationSection}
    <PropertySection title={t('textMotion.sectionTitle')} icon={WandSparkles} defaultOpen={true}>
      <div class="flex flex-col gap-2 py-1">
        <p class="text-[10px] leading-snug text-muted-foreground/70">
          {t('textMotion.hint')}
        </p>
        <TextMotionSlotRows items={textItems} />
      </div>
    </PropertySection>
  {/if}
{/if}
