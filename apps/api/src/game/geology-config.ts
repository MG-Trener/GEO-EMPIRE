export const GEOLOGY_RANGE_METERS = [30, 50, 75, 120, 180, 250, 350, 500, 750, 1000] as const;
export const GEOLOGY_COVERAGE_RINGS = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6] as const;
export const GEOLOGY_MAX_DEPTH_METERS = [50, 75, 100, 150, 250, 400, 600, 900, 1300, 2000] as const;

// Accuracy is now useful from the very first scan. Common shallow deposits can
// enter a pilot project at starter accuracy, while deeper/rarer projects still
// need investment in better geology before approval.
export const GEOLOGY_ACCURACY_ERROR = [0.45, 0.35, 0.27, 0.20, 0.15, 0.11, 0.08, 0.06, 0.04, 0.02] as const;
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
