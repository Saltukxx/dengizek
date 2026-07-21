// ---------------------------------------------------------------------------
// gpt-4o-mini token maliyeti tahmini — yalnızca dashboard'da kabaca
// bilgilendirme amaçlı, fatura kaynağı DEĞİL. Fiyatlar OpenAI tarafında
// değişirse burada güncellenmeli (bkz. https://openai.com/api/pricing/).
// ---------------------------------------------------------------------------

const INPUT_COST_PER_1M_TOKENS_USD = 0.15;
const OUTPUT_COST_PER_1M_TOKENS_USD = 0.6;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_1M_TOKENS_USD +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_TOKENS_USD
  );
}
