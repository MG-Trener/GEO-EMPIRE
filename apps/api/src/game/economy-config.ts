// Server-authoritative economy values. Keep the onboarding loop deliberately
// forgiving: a new company must be able to scan, lease a first site, improve
// basic geology and commission a small pilot development before its first sale.
export const TERRITORY_CLAIM_COST = 2_500;
export const TERRITORY_LEASE_DAYS = 30;
export const TERRITORY_INTERACTION_DISTANCE_METERS = 50;

export const STARTER_SOFT_CURRENCY = 100_000;
export const STARTER_PREMIUM_CURRENCY = 50;

// Prototype-only grant used by the one-time tester reset build. It is kept
// separate from the normal onboarding balance so production balancing remains
// meaningful while the current APK can exercise every subsystem.
export const TESTER_SOFT_CURRENCY = 2_500_000;
export const TESTER_PREMIUM_CURRENCY = 5_000;
export const TESTER_RESOURCE_QUANTITY = 50_000;
