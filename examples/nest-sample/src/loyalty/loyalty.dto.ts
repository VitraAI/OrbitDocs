import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PageInfoDto, PageQueryDto } from '../common/pagination.dto';

export enum LoyaltyTier {
  Explorer = 'explorer',
  Voyager = 'voyager',
  Pioneer = 'pioneer',
  Admiral = 'admiral',
}

export enum LoyaltyTransactionType {
  Earn = 'earn',
  Redeem = 'redeem',
  Expire = 'expire',
  Adjust = 'adjust',
}

export enum RewardType {
  CabinUpgrade = 'cabin_upgrade',
  LoungeAccess = 'lounge_access',
  ExtraBaggage = 'extra_baggage',
  BookingCredit = 'booking_credit',
}

export enum RedemptionStatus {
  Completed = 'completed',
}

export class TierProgressDto {
  @ApiProperty({ enum: LoyaltyTier, enumName: 'LoyaltyTier', nullable: true, example: LoyaltyTier.Pioneer, description: 'Next tier up; `null` at Admiral.' })
  nextTier: LoyaltyTier | null;

  @ApiProperty({ type: Number, nullable: true, example: 22000, description: 'Lifetime points still needed for the next tier; `null` at Admiral.' })
  pointsToNextTier: number | null;

  /**
   * Progress from this tier to the next, 0–100.
   * @example 56
   */
  percent: number;
}

export class LoyaltyAccountDto {
  /**
   * Account id.
   * @example "loy_2Hk9Wd"
   */
  id: string;

  /**
   * Orbit Miles member number, printed on boarding passes.
   * @example "OT 4410 2291"
   */
  memberNumber: string;

  @ApiProperty({ enum: LoyaltyTier, enumName: 'LoyaltyTier', example: LoyaltyTier.Voyager, description: 'Current tier, from lifetime points.' })
  tier: LoyaltyTier;

  /**
   * Points you can spend now.
   * @example 48250
   */
  pointsBalance: number;

  /**
   * Points from flights not yet flown; they become spendable after departure.
   * @example 12999
   */
  pointsPending: number;

  /**
   * All points ever earned (sets the tier).
   * @example 53000
   */
  lifetimePoints: number;

  /** Distance to the next tier. */
  tierProgress: TierProgressDto;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2028-10-31', description: 'When the oldest points expire; `null` if none will.' })
  pointsExpireOn: string | null;

  @ApiProperty({ format: 'date', example: '2026-03-14', description: 'When the account was opened.' })
  memberSince: string;
}

export class LoyaltyTransactionDto {
  /**
   * Transaction id.
   * @example "ltx_9mWq2D"
   */
  id: string;

  @ApiProperty({ enum: LoyaltyTransactionType, enumName: 'LoyaltyTransactionType', example: LoyaltyTransactionType.Earn, description: 'What moved the balance.' })
  type: LoyaltyTransactionType;

  /**
   * Points added (positive) or taken (negative).
   * @example 12999
   */
  points: number;

  /**
   * Balance right after this transaction.
   * @example 48250
   */
  balanceAfter: number;

  /**
   * What it was for.
   * @example "Flight flt_2031_proxima, economy"
   */
  description: string;

  @ApiProperty({ type: String, nullable: true, example: 'bk_7Hq2xP', description: 'Booking it relates to, or `null`.' })
  bookingId: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:01:00Z', description: 'When it happened.' })
  createdAt: string;
}

export class ListLoyaltyTransactionsQueryDto extends PageQueryDto {
  @ApiProperty({ enum: LoyaltyTransactionType, enumName: 'LoyaltyTransactionType', required: false, description: 'Only transactions of this type.' })
  @IsOptional()
  @IsEnum(LoyaltyTransactionType)
  type?: LoyaltyTransactionType;
}

export class LoyaltyTransactionListDto {
  /** Transactions on this page, newest first. */
  data: LoyaltyTransactionDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}

export class CreateRedemptionDto {
  @ApiProperty({
    enum: RewardType,
    enumName: 'RewardType',
    example: RewardType.LoungeAccess,
    description: 'Reward to buy. Costs: `cabin_upgrade` 40,000, `booking_credit` 10,000 ($100 off), `extra_baggage` 8,000, `lounge_access` 5,000.',
  })
  @IsEnum(RewardType)
  reward: RewardType;

  /**
   * Booking the reward applies to. Required for `cabin_upgrade` and `extra_baggage`.
   * @example "bk_7Hq2xP"
   */
  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class RedemptionDto {
  /**
   * Redemption id.
   * @example "rdm_4TzQ1n"
   */
  id: string;

  @ApiProperty({ enum: RewardType, enumName: 'RewardType', example: RewardType.LoungeAccess, description: 'Reward bought.' })
  reward: RewardType;

  /**
   * Points spent.
   * @example 5000
   */
  points: number;

  @ApiProperty({ type: String, nullable: true, example: 'bk_7Hq2xP', description: 'Booking the reward applies to, or `null`.' })
  bookingId: string | null;

  /**
   * Loyalty transaction that took the points.
   * @example "ltx_5RbX0c"
   */
  transactionId: string;

  @ApiProperty({ enum: RedemptionStatus, enumName: 'RedemptionStatus', example: RedemptionStatus.Completed, description: 'Redemptions complete immediately.' })
  status: RedemptionStatus;

  @ApiProperty({ format: 'date-time', example: '2026-10-04T09:30:00Z', description: 'When the points were spent.' })
  createdAt: string;
}
