/** 12345 copper → "1g 23s 45c", leaving out the parts that are zero. */
export function formatMoney(copper: number): string {
  const total = Math.max(0, Math.floor(copper));
  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const rest = total % 100;
  const parts: string[] = [];
  if (gold) parts.push(`${gold}g`);
  if (silver) parts.push(`${silver}s`);
  if (rest || parts.length === 0) parts.push(`${rest}c`);
  return parts.join(' ');
}
