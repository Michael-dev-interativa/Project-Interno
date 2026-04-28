/**
 * Formata horas sempre com 1 casa decimal
 * Exemplos:
 * - 4.00 → "4.0h"
 * - 4.5 → "4.5h"
 * - 8.75 → "8.8h"
 * - 10.5 → "10.5h"
 * - 0.1 → "0.1h"
 */
export function formatHoras(horas) {
  if (horas == null || isNaN(horas)) return '0.0h';
  return `${Number(horas).toFixed(1)}h`;
}

/**
 * Variante que retorna apenas o número formatado sem o "h"
 */
export function formatHorasNumber(horas) {
  if (horas == null || isNaN(horas)) return '0.0';
  return Number(horas).toFixed(1);
}

