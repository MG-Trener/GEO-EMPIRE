export const RESOURCE_MARKET_BASE_PRICES: Record<string, number> = {
  IRON_ORE: 6,
  COPPER_ORE: 18,
  GOLD_ORE: 260,
  SILVER_ORE: 95,
  COAL: 5,
  CRUDE_OIL: 82,
  NATURAL_GAS: 2,
  LIMESTONE: 3,
  SAND: 2,
  CLAY: 3,
  TIMBER: 14,
  WHEAT: 8,
  URANIUM: 185,
  LITHIUM: 115,
  RARE_EARTHS: 320,
};

export function getResourceMarketPrice(resourceCode: string): number | null {
  const price = RESOURCE_MARKET_BASE_PRICES[resourceCode];
  return Number.isFinite(price) && price > 0 ? price : null;
}
