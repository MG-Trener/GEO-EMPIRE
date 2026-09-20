export const GEOLOGY_RANGE_METERS = [30, 50, 75, 120, 180, 250, 350, 500, 750, 1000] as const;
export const GEOLOGY_COVERAGE_RINGS = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6] as const;

// Coverage controls the physical radius of the geology heatmap around the scan
// point. This is intentionally separate from rangeMeters: range determines how
// far from the player a scan may be targeted, while scanRadiusMeters determines
// how much ground the scanner reveals after the player starts reconnaissance.
export const GEOLOGY_SCAN_RADIUS_METERS = [75, 100, 150, 220, 320, 450, 600, 750, 900, 1200] as const;
export const GEOLOGY_MAX_DEPTH_METERS = [50, 75, 100, 150, 250, 400, 600, 900, 1300, 2000] as const;

// Heatmap cells are shared world data derived only from coordinates, resource
// code and this fixed world seed. Do not change the seed after production launch
// unless a deliberate world reset is intended.
export const GEOLOGY_WORLD_SEED = 42_619_784;
export const GEOLOGY_HEATMAP_RESOLUTION = 11;
export const GEOLOGY_HEATMAP_CELL_SPACING_METERS = 50;

// The starter survey is deliberately good enough to validate a shallow common
// deposit. Progression still matters for better estimates, but depth and
// sensitivity remain the main gates for valuable deposits.
export const GEOLOGY_ACCURACY_ERROR = [0.15, 0.12, 0.10, 0.08, 0.065, 0.05, 0.04, 0.03, 0.025, 0.02] as const;
export const GEOLOGY_SENSITIVITY_RARITY = [2, 3, 4, 5, 6, 7, 8, 9, 9, 10] as const;

export const GEOLOGY_SKILL_KEYS = ['range', 'coverage', 'depth', 'accuracy', 'sensitivity'] as const;
export type GeologySkillKey = (typeof GEOLOGY_SKILL_KEYS)[number];

// Early tiers are intentionally cheap enough to teach the upgrade loop before
// the first mine. Later tiers scale strongly and remain a meaningful sink.
export const GEOLOGY_UPGRADE_SOFT_COSTS = [1_500, 3_000, 5_000, 8_000, 12_000, 18_000, 27_000, 40_000, 60_000] as const;
export const GEOLOGY_UPGRADE_PREMIUM_COSTS = [5, 8, 12, 18, 28, 42, 65, 95, 140] as const;

export type GeologySkills = {
  rangeLevel: number;
  coverageLevel: number;
  depthLevel: number;
  accuracyLevel: number;
  sensitivityLevel: number;
};

function atLevel<T>(levels: readonly T[], level: number): T {
  const normalized = Math.min(Math.max(Math.trunc(level), 1), levels.length);
  return levels[normalized - 1];
}

export function getGeologyCapabilities(skills: GeologySkills) {
  return {
    rangeMeters: atLevel(GEOLOGY_RANGE_METERS, skills.rangeLevel),
    coverageRing: atLevel(GEOLOGY_COVERAGE_RINGS, skills.coverageLevel),
    scanRadiusMeters: atLevel(GEOLOGY_SCAN_RADIUS_METERS, skills.coverageLevel),
    maxDepthMeters: atLevel(GEOLOGY_MAX_DEPTH_METERS, skills.depthLevel),
    accuracyError: atLevel(GEOLOGY_ACCURACY_ERROR, skills.accuracyLevel),
    maxVisibleRarity: atLevel(GEOLOGY_SENSITIVITY_RARITY, skills.sensitivityLevel),
  };
}

export function getGeologyUpgradePrice(currentLevel: number): { soft: number; premium: number } | null {
  const normalized = Math.trunc(currentLevel);
  if (normalized < 1 || normalized >= 10) return null;

  return {
    soft: GEOLOGY_UPGRADE_SOFT_COSTS[normalized - 1],
    premium: GEOLOGY_UPGRADE_PREMIUM_COSTS[normalized - 1],
  };
}
