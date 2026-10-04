import { PaymentDto, PaymentMethodType, PaymentStatus, CardBrand } from './payment.dto';

/** In-memory payments, newest first. Seeded with the payment the docs' examples use. */
export const PAYMENTS: PaymentDto[] = [
  {
    id: 'pay_3kTq9Z',
    bookingId: 'bk_7Hq2xP',
    status: PaymentStatus.Succeeded,
    amount: 1299900,
    amountRefunded: 0,
    currency: 'USD',
    method: { type: PaymentMethodType.Card, card: { brand: CardBrand.Visa, last4: '4242', expMonth: 8, expYear: 2033 }, wallet: null, bankTransfer: null },
    failureCode: null,
    failureMessage: null,
    refunds: [],
    metadata: { orderId: 'order-8812' },
    createdAt: '2026-10-03T12:01:00Z',
  },
];

/** Idempotency keys of payment requests → the payment created and a fingerprint of the request. */
export const PAYMENT_KEYS = new Map<string, { paymentId: string; fingerprint: string }>();
