import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiHeader, ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@orbitdocs/nestjs';
import type { Response } from 'express';

import { BookingStatus } from '../bookings/booking.dto';
import { BOOKINGS } from '../bookings/bookings.store';
import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { RateLimited, ResponseHeaders } from '../common/rate-limit';
import { LoyaltyTransactionType } from '../loyalty/loyalty.dto';
import { recordPoints } from '../loyalty/loyalty.store';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PaymentRequestPipe } from './payment-request.pipe';
import {
  BankTransferPaymentRequestDto,
  CardBrand,
  CardPaymentRequestDto,
  CREATE_PAYMENT_SCHEMA,
  CreatePaymentDto,
  CreateRefundDto,
  PaymentDto,
  PaymentMethodDetailsDto,
  PaymentMethodType,
  PaymentStatus,
  RefundDto,
  RefundStatus,
  WalletPaymentRequestDto,
} from './payment.dto';
import { PAYMENT_KEYS, PAYMENTS } from './payments.store';

const DECLINED_TOKEN = 'tok_chargeDeclined';

function methodDetails(dto: CreatePaymentDto, bookingId: string): PaymentMethodDetailsDto {
  const none = { card: null, wallet: null, bankTransfer: null };
  switch (dto.type) {
    case PaymentMethodType.Card: {
      const brand = /amex/.test(dto.token) ? CardBrand.Amex : /master/.test(dto.token) ? CardBrand.Mastercard : CardBrand.Visa;
      return { type: dto.type, ...none, card: { brand, last4: /\d{4}$/.exec(dto.token)?.[0] ?? '4242', expMonth: 8, expYear: 2033 } };
    }
    case PaymentMethodType.Wallet:
      return { type: dto.type, ...none, wallet: dto.wallet };
    case PaymentMethodType.BankTransfer:
      return {
        type: dto.type,
        ...none,
        bankTransfer: {
          iban: 'DE89370400440532013000',
          bic: 'COBADEFFXXX',
          reference: `ORBIT-${bookingId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
          dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        },
      };
  }
}

@Controller({ version: '1' })
@Authenticated()
@RateLimited()
@ApiExtraModels(CardPaymentRequestDto, WalletPaymentRequestDto, BankTransferPaymentRequestDto)
export class PaymentsController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Pays for a booking by card, digital wallet or bank transfer; `type`
   * picks which. Cards and wallets are charged at once and the payment is
   * `succeeded` or `failed` (a `payment.succeeded` or `payment.failed`
   * webhook follows). Bank transfers stay `pending` until the money arrives;
   * `method.bankTransfer` says where to send it.
   *
   * The `Idempotency-Key` header is required: retrying with the same key
   * returns the first payment (with `Idempotent-Replayed: true`) and never
   * charges twice.
   */
  @Post('bookings/:id/payments')
  @DocsOperation({ group: 'Payments', title: 'Pay for a booking', order: 1 })
  @ApiParam({ name: 'id', description: 'Booking id.', example: 'bk_9Rz4Wt' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key per payment attempt (a UUID works). Keys are kept for 24 hours.',
    example: '8e03978e-40d5-43e8-bc93-6894a57f9324',
  })
  @ApiBody({ schema: CREATE_PAYMENT_SCHEMA, description: 'One of three shapes, told apart by `type`.' })
  @ResponseHeaders(201, {
    'Idempotent-Replayed': { description: '`true` when this is the stored response to an earlier request with the same key.', schema: { type: 'string', example: 'true' } },
  })
  @DocsErrors({
    400: 'The body is invalid, or the `Idempotency-Key` header is missing.',
    404: 'No booking with this id.',
    409: 'The booking is cancelled or already paid.',
    422: 'This `Idempotency-Key` was already used with a different request.',
  })
  create(
    @Param('id') bookingId: string,
    @Body(PaymentRequestPipe) dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') key?: string,
  ): PaymentDto {
    if (!key) throw new BadRequestException(['Idempotency-Key header is required']);
    const fingerprint = JSON.stringify([bookingId, dto]);
    const previous = PAYMENT_KEYS.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new UnprocessableEntityException('This Idempotency-Key was already used with a different request');
      res.setHeader('Idempotent-Replayed', 'true');
      return PAYMENTS.find((p) => p.id === previous.paymentId)!;
    }
    const booking = BOOKINGS.find((b) => b.id === bookingId);
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.status === BookingStatus.Cancelled) throw new ConflictException('The booking is cancelled');
    const paid = PAYMENTS.some((p) => p.bookingId === bookingId && p.status !== PaymentStatus.Failed);
    if (paid) throw new ConflictException('The booking is already paid');

    const declined = dto.type === PaymentMethodType.Card && dto.token === DECLINED_TOKEN;
    const status = declined ? PaymentStatus.Failed : dto.type === PaymentMethodType.BankTransfer ? PaymentStatus.Pending : PaymentStatus.Succeeded;
    const payment: PaymentDto = {
      id: newId('pay'),
      bookingId,
      status,
      amount: booking.totalAmount,
      amountRefunded: 0,
      currency: booking.currency,
      method: methodDetails(dto, bookingId),
      failureCode: declined ? 'card_declined' : null,
      failureMessage: declined ? 'The card was declined.' : null,
      refunds: [],
      metadata: dto.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    PAYMENTS.unshift(payment);
    PAYMENT_KEYS.set(key, { paymentId: payment.id, fingerprint });
    if (status === PaymentStatus.Succeeded) {
      recordPoints(LoyaltyTransactionType.Earn, Math.floor(payment.amount / 100), `Flight ${booking.flightId}, ${booking.cabin}`, booking.id);
      this.webhooks.emit('payment.succeeded', payment);
    } else if (status === PaymentStatus.Failed) {
      this.webhooks.emit('payment.failed', payment);
    }
    return payment;
  }

  /**
   * Returns one payment with its refunds.
   */
  @Get('payments/:id')
  @DocsOperation({ group: 'Payments', title: 'Get a payment', order: 2 })
  @DocsErrors({ 404: 'No payment with this id.' })
  @ApiParam({ name: 'id', description: 'Payment id.', example: 'pay_3kTq9Z' })
  get(@Param('id') id: string): PaymentDto {
    return this.find(id);
  }

  /**
   * Returns money to the customer, all of it or part. Refund several times
   * until the payment is fully refunded. Refunding does not cancel the
   * booking; cancel it first if the customer is not flying.
   */
  @Post('payments/:id/refunds')
  @DocsOperation({ group: 'Payments', title: 'Refund a payment', order: 3 })
  @DocsErrors({
    404: 'No payment with this id.',
    409: 'The payment has not succeeded, or is already fully refunded.',
    422: '`amount` is more than what is left to refund.',
  })
  @ApiParam({ name: 'id', description: 'Payment id.', example: 'pay_3kTq9Z' })
  refund(@Param('id') id: string, @Body() dto: CreateRefundDto): RefundDto {
    const payment = this.find(id);
    if (payment.status !== PaymentStatus.Succeeded && payment.status !== PaymentStatus.PartiallyRefunded) {
      throw new ConflictException(`A ${payment.status} payment cannot be refunded`);
    }
    const left = payment.amount - payment.amountRefunded;
    const amount = dto.amount ?? left;
    if (amount > left) throw new UnprocessableEntityException(`Only ${left} is left to refund`);
    const refund: RefundDto = {
      id: newId('re'),
      paymentId: payment.id,
      amount,
      currency: payment.currency,
      reason: dto.reason,
      status: payment.method.type === PaymentMethodType.BankTransfer ? RefundStatus.Pending : RefundStatus.Succeeded,
      createdAt: new Date().toISOString(),
    };
    payment.refunds.push(refund);
    payment.amountRefunded += amount;
    payment.status = payment.amountRefunded === payment.amount ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded;
    return refund;
  }

  private find(id: string): PaymentDto {
    const payment = PAYMENTS.find((p) => p.id === id);
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
