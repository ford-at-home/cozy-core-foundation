/** Rough token estimate for English prose / markdown (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function promptSummary(charCount: number): string {
  const tokens = Math.ceil(charCount / 4);
  return `dispatch prompt: ${charCount.toLocaleString()} chars (~${tokens.toLocaleString()} est. tokens)`;
}
