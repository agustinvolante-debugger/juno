/** Single source of truth for runtime config. The chatbot model string lives
 *  HERE and nowhere else (per CLAUDE.md). Verify against Anthropic's current
 *  model list before Gate 5 pins this for production. */
export const CONFIG = {
  chatModel: "claude-sonnet-5", // Gate 5: re-verify against docs before ship
  maxAnswerTokens: 1200,
  retrieval: {
    vectorTopK: 20,
    textTopK: 20,
    rerankTo: 6,
    currentPageBoost: 1.3,
  },
} as const;
