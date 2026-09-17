export const GEOLOGY_RANGE_METERS = [30, 50, 75, 120, 180, 250, 350, 500, 750, 1000] as const;
export const GEOLOGY_COVERAGE_RINGS = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6] as const;
export const GEOLOGY_MAX_DEPTH_METERS = [50, 75, 100, 150, 250, 400, 600, 900, 1300, 2000] as const;
export const GEOLOGY_ACCURACY_ERROR = [0.7, 0.55, 0.4, 0.3, 0.22, 0.16, 0.12, 0.08, 0.05, 0.02] as const;
export const GEOLOGY_SENSITIVITY_RARITY = [2, 3, 4, 5, 6, 7, 8, 9, 9, 10] as const;

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
