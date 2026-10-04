import { newId } from '../common/id';
import { LoyaltyAccountDto, LoyaltyTier, LoyaltyTransactionDto, LoyaltyTransactionType } from './loyalty.dto';

/** Lifetime points needed for each tier, lowest first. */
const TIERS: Array<[LoyaltyTier, number]> = [
  [LoyaltyTier.Explorer, 0],
  [LoyaltyTier.Voyager, 25000],
  [LoyaltyTier.Pioneer, 75000],
  [LoyaltyTier.Admiral, 200000],
];

/** The account of the (single) demo customer. */
export const ACCOUNT: LoyaltyAccountDto = {
  id: 'loy_2Hk9Wd',
  memberNumber: 'OT 4410 2291',
  tier: LoyaltyTier.Voyager,
  pointsBalance: 48250,
  pointsPending: 0,
  lifetimePoints: 53000,
  tierProgress: { nextTier: LoyaltyTier.Pioneer, pointsToNextTier: 22000, percent: 56 },
  pointsExpireOn: '2028-10-31',
  memberSince: '2026-03-14',
};

/** Loyalty transactions, newest first. */
export const TRANSACTIONS: LoyaltyTransactionDto[] = [
  { id: 'ltx_9mWq2D', type: LoyaltyTransactionType.Earn, points: 12999, balanceAfter: 48250, description: 'Flight flt_2031_proxima, economy', bookingId: 'bk_7Hq2xP', createdAt: '2026-10-03T12:01:00Z' },
  { id: 'ltx_7cVb1R', type: LoyaltyTransactionType.Redeem, points: -5000, balanceAfter: 35251, description: 'Reward: lounge_access', bookingId: null, createdAt: '2026-07-20T16:40:00Z' },
  { id: 'ltx_3aKs8P', type: LoyaltyTransactionType.Adjust, points: 251, balanceAfter: 40251, description: 'Goodwill: delayed launch', bookingId: null, createdAt: '2026-05-02T09:12:00Z' },
  { id: 'ltx_1dYe5T', type: LoyaltyTransactionType.Earn, points: 40000, balanceAfter: 40000, description: 'Welcome bonus', bookingId: null, createdAt: '2026-03-14T10:00:00Z' },
];

function refreshTier(): void {
  const index = TIERS.reduce((at, [, min], i) => (ACCOUNT.lifetimePoints >= min ? i : at), 0);
  ACCOUNT.tier = TIERS[index]![0];
  const next = TIERS[index + 1];
  const floor = TIERS[index]![1];
  ACCOUNT.tierProgress = next
    ? { nextTier: next[0], pointsToNextTier: next[1] - ACCOUNT.lifetimePoints, percent: Math.floor(((ACCOUNT.lifetimePoints - floor) / (next[1] - floor)) * 100) }
    : { nextTier: null, pointsToNextTier: null, percent: 100 };
}

/** Adds (or, with negative points, takes) points and records the transaction. */
export function recordPoints(type: LoyaltyTransactionType, points: number, description: string, bookingId: string | null): LoyaltyTransactionDto {
  ACCOUNT.pointsBalance += points;
  if (points > 0) ACCOUNT.lifetimePoints += points;
  refreshTier();
  const tx: LoyaltyTransactionDto = {
    id: newId('ltx'),
    type,
    points,
    balanceAfter: ACCOUNT.pointsBalance,
    description,
    bookingId,
    createdAt: new Date().toISOString(),
  };
  TRANSACTIONS.unshift(tx);
  return tx;
}
