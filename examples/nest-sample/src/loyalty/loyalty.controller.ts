import { Body, ConflictException, Controller, Get, NotFoundException, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { DocsErrors, DocsOperation } from '@orbitdocs/nestjs';

import { BOOKINGS } from '../bookings/bookings.store';
import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { paginate } from '../common/pagination.dto';
import { RateLimited } from '../common/rate-limit';
import {
  CreateRedemptionDto,
  ListLoyaltyTransactionsQueryDto,
  LoyaltyAccountDto,
  LoyaltyTransactionListDto,
  LoyaltyTransactionType,
  RedemptionDto,
  RedemptionStatus,
  RewardType,
} from './loyalty.dto';
import { ACCOUNT, recordPoints, TRANSACTIONS } from './loyalty.store';

const COSTS: Record<RewardType, number> = {
  [RewardType.CabinUpgrade]: 40000,
  [RewardType.BookingCredit]: 10000,
  [RewardType.ExtraBaggage]: 8000,
  [RewardType.LoungeAccess]: 5000,
};

const NEEDS_BOOKING = new Set([RewardType.CabinUpgrade, RewardType.ExtraBaggage]);

@Controller({ path: 'loyalty', version: '1' })
@Authenticated()
@RateLimited()
export class LoyaltyController {
  /**
   * Returns the Orbit Miles account of the customer the key belongs to:
   * balance, tier and how far the next tier is. Paid bookings earn one point
   * per dollar.
   */
  @Get('account')
  @DocsOperation({ group: 'Loyalty', title: 'Get the loyalty account', order: 1 })
  account(): LoyaltyAccountDto {
    return ACCOUNT;
  }

  /**
   * Lists points earned, spent, expired and adjusted, newest first.
   */
  @Get('transactions')
  @DocsOperation({ group: 'Loyalty', title: 'List loyalty transactions', order: 2 })
  transactions(@Query() query: ListLoyaltyTransactionsQueryDto): LoyaltyTransactionListDto {
    const items = query.type ? TRANSACTIONS.filter((t) => t.type === query.type) : TRANSACTIONS;
    return paginate(items, query);
  }

  /**
   * Spends points on a reward. The points leave the balance at once and a
   * `redeem` transaction is recorded.
   */
  @Post('redemptions')
  @DocsOperation({ group: 'Loyalty', title: 'Redeem points', order: 3 })
  @DocsErrors({
    404: 'No booking with this id.',
    409: 'Not enough points for this reward.',
    422: 'This reward needs a `bookingId`.',
  })
  redeem(@Body() dto: CreateRedemptionDto): RedemptionDto {
    if (NEEDS_BOOKING.has(dto.reward) && !dto.bookingId) throw new UnprocessableEntityException(`${dto.reward} needs a bookingId`);
    if (dto.bookingId && !BOOKINGS.some((b) => b.id === dto.bookingId)) throw new NotFoundException(`Booking ${dto.bookingId} not found`);
    const points = COSTS[dto.reward];
    if (ACCOUNT.pointsBalance < points) throw new ConflictException(`${dto.reward} costs ${points} points; the balance is ${ACCOUNT.pointsBalance}`);
    const tx = recordPoints(LoyaltyTransactionType.Redeem, -points, `Reward: ${dto.reward}`, dto.bookingId ?? null);
    return {
      id: newId('rdm'),
      reward: dto.reward,
      points,
      bookingId: dto.bookingId ?? null,
      transactionId: tx.id,
      status: RedemptionStatus.Completed,
      createdAt: tx.createdAt,
    };
  }
}
