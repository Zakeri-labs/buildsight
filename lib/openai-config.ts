import "server-only"

/**
 * Centralized OpenAI Model & API Configuration Helper
 * Resolves dedicated environment variables for each AI feature, falling back to legacy/default models if not set.
 */

export const OPENAI_CONFIG = {
  /**
   * Shared OpenAI API key for authentication across all features.
   */
  get apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY?.trim()
  },

  /**
   * 1) Report / document translation model.
   * Env Var: OPENAI_REPORT_TRANSLATION_MODEL
   * Fallback: OPENAI_TRANSLATION_MODEL -> "gpt-5.6"
   */
  get reportTranslationModel(): string {
    return (
      process.env.OPENAI_REPORT_TRANSLATION_MODEL?.trim() ||
      process.env.OPENAI_TRANSLATION_MODEL?.trim() ||
      "gpt-5.6"
    )
  },

  /**
   * 2) Voice-to-text / speech transcription model.
   * Env Var: OPENAI_TRANSCRIPTION_MODEL
   * Fallback: "whisper-1"
   */
  get transcriptionModel(): string {
    return (
      process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
      "whisper-1"
    )
  },

  /**
   * 3) Form text enhancement & inline translation model.
   * Env Var: OPENAI_ENHANCE_TEXT_MODEL
   * Fallback: OPENAI_TRANSLATION_MODEL -> "gpt-4o-mini"
   */
  get enhanceTextModel(): string {
    const configured =
      process.env.OPENAI_ENHANCE_TEXT_MODEL?.trim() ||
      process.env.OPENAI_TRANSLATION_MODEL?.trim() ||
      "gpt-4o-mini"
    return configured.startsWith("gpt-5") ? "gpt-4o-mini" : configured
  },

  /**
   * 4) AI Summary generation model.
   * Env Var: OPENAI_SUMMARY_MODEL
   * Fallback: "gpt-5.6"
   */
  get summaryModel(): string {
    return (
      process.env.OPENAI_SUMMARY_MODEL?.trim() ||
      "gpt-5.6"
    )
  },
} as const
