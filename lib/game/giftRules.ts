/**
 * TNT per single gift, by the gift's coin value:
 *   1-5 coins  -> 1 TNT
 *   6-29 coins -> 5 TNT
 *   30+ coins  -> 20 TNT
 */
export function tntForCoins(coins: number): number {
  if (coins >= 30) return 20;
  if (coins >= 6) return 5;
  return 1;
}
