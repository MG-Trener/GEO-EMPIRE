export type StoreResourceGrant = {
  resourceCode: string;
  quantity: number;
};

export type StorePack = {
  code: string;
  name: string;
  description: string;
  premiumPrice: number;
  softGrant: number;
  resourceGrants: StoreResourceGrant[];
  badge?: string;
};

export const STORE_PACKS: StorePack[] = [
  {
    code: 'FIELD_STARTER',
    name: 'Полевой старт',
    description: 'Быстрый запас средств для аренды участка и первых операций.',
    premiumPrice: 10,
    softGrant: 12_000,
    resourceGrants: [],
    badge: 'СТАРТ',
  },
  {
    code: 'CONSTRUCTION_RESERVE',
    name: 'Строительный резерв',
    description: 'Фиксированный набор базовых строительных материалов без случайного содержимого.',
    premiumPrice: 15,
    softGrant: 5_000,
    resourceGrants: [
      { resourceCode: 'SAND', quantity: 60 },
      { resourceCode: 'CLAY', quantity: 40 },
      { resourceCode: 'LIMESTONE', quantity: 60 },
    ],
    badge: 'РЕСУРСЫ',
  },
  {
    code: 'INDUSTRIAL_PUSH',
    name: 'Промышленный рывок',
    description: 'Крупный фиксированный набор для ускорения раннего развития компании.',
    premiumPrice: 25,
    softGrant: 25_000,
    resourceGrants: [
      { resourceCode: 'IRON_ORE', quantity: 120 },
      { resourceCode: 'COAL', quantity: 120 },
    ],
    badge: 'ВЫГОДНО',
  },
];

export function getStorePack(code: string): StorePack | undefined {
  return STORE_PACKS.find((pack) => pack.code === code);
}
