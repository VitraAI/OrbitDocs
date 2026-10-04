import { ApiProperty, type ApiPropertyOptions, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Min } from 'class-validator';

export enum PaymentMethodType {
  Card = 'card',
  Wallet = 'wallet',
  BankTransfer = 'bank_transfer',
}

export enum PaymentStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
  PartiallyRefunded = 'partially_refunded',
  Refunded = 'refunded',
}

export enum WalletType {
  ApplePay = 'apple_pay',
  GooglePay = 'google_pay',
}

export enum CardBrand {
  Visa = 'visa',
  Mastercard = 'mastercard',
  Amex = 'amex',
}

export enum RefundReason {
  RequestedByCustomer = 'requested_by_customer',
  Duplicate = 'duplicate',
  FlightCancelled = 'flight_cancelled',
}

export enum RefundStatus {
  Pending = 'pending',
  Succeeded = 'succeeded',
}

/** A string-to-string map of the caller's own data. */
const metadata = (required = true): ApiPropertyOptions => ({
  required,
  type: Object,
  additionalProperties: { type: 'string' },
  example: { orderId: 'order-8812', channel: 'web' },
  description: 'Up to 20 key-value pairs of your own, returned on the payment and in its webhooks.',
});

/** Fields every payment request shares. */
abstract class PaymentRequestBaseDto {
  @ApiProperty(metadata(false))
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class CardPaymentRequestDto extends PaymentRequestBaseDto {
  @ApiProperty({ enum: [PaymentMethodType.Card], example: PaymentMethodType.Card, description: 'Pay by card.' })
  @Equals(PaymentMethodType.Card)
  type: PaymentMethodType.Card;

  /**
   * Card token from Orbit.js. Raw card numbers are never accepted. In test
   * mode, `tok_chargeDeclined` fails.
   * @example "tok_visa_4242"
   */
  @Matches(/^tok_\w+$/)
  token: string;

  /** Keep the card for this customer's next booking. */
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;
}

export class WalletPaymentRequestDto extends PaymentRequestBaseDto {
  @ApiProperty({ enum: [PaymentMethodType.Wallet], example: PaymentMethodType.Wallet, description: 'Pay with a digital wallet.' })
  @Equals(PaymentMethodType.Wallet)
  type: PaymentMethodType.Wallet;

  @ApiProperty({ enum: WalletType, enumName: 'WalletType', example: WalletType.ApplePay, description: 'Wallet the token comes from.' })
  @IsEnum(WalletType)
  wallet: WalletType;

  /**
   * Payment token from the wallet's sheet.
   * @example "wlt_applepay_8b21f0"
   */
  @IsString()
  token: string;
}

export class BankTransferPaymentRequestDto extends PaymentRequestBaseDto {
  @ApiProperty({ enum: [PaymentMethodType.BankTransfer], example: PaymentMethodType.BankTransfer, description: 'Pay by bank transfer. The payment stays `pending` until the money arrives.' })
  @Equals(PaymentMethodType.BankTransfer)
  type: PaymentMethodType.BankTransfer;

  /**
   * Name on the paying account.
   * @example "Ada Lovelace"
   */
  @IsString()
  accountHolderName: string;

  /**
   * Country of the paying bank, ISO 3166-1 alpha-2 (SEPA countries only).
   * @example "DE"
   */
  @Matches(/^[A-Z]{2}$/)
  country: string;
}

export type CreatePaymentDto = CardPaymentRequestDto | WalletPaymentRequestDto | BankTransferPaymentRequestDto;

export const PAYMENT_REQUEST_TYPES = {
  [PaymentMethodType.Card]: CardPaymentRequestDto,
  [PaymentMethodType.Wallet]: WalletPaymentRequestDto,
  [PaymentMethodType.BankTransfer]: BankTransferPaymentRequestDto,
};

/** `oneOf` the three request bodies, told apart by `type`. */
export const CREATE_PAYMENT_SCHEMA = {
  oneOf: Object.values(PAYMENT_REQUEST_TYPES).map((t) => ({ $ref: getSchemaPath(t) })),
  discriminator: {
    propertyName: 'type',
    mapping: Object.fromEntries(Object.entries(PAYMENT_REQUEST_TYPES).map(([k, t]) => [k, getSchemaPath(t)])),
  },
};

export class CardDetailsDto {
  @ApiProperty({ enum: CardBrand, enumName: 'CardBrand', example: CardBrand.Visa, description: 'Card network.' })
  brand: CardBrand;

  /**
   * Last four digits.
   * @example "4242"
   */
  last4: string;

  /**
   * Expiry month (1–12).
   * @example 8
   */
  expMonth: number;

  /**
   * Expiry year.
   * @example 2033
   */
  expYear: number;
}

export class BankTransferInstructionsDto {
  /**
   * Account to send the money to.
   * @example "DE89370400440532013000"
   */
  iban: string;

  /**
   * Bank identifier.
   * @example "COBADEFFXXX"
   */
  bic: string;

  /**
   * Put this in the transfer's reference so we can match it.
   * @example "ORBIT-BK7HQ2XP"
   */
  reference: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-11T12:00:00Z', description: 'Pay by then, or the booking is cancelled.' })
  dueAt: string;
}

export class PaymentMethodDetailsDto {
  @ApiProperty({ enum: PaymentMethodType, enumName: 'PaymentMethodType', example: PaymentMethodType.Card, description: 'How the payment was made. Exactly one of the objects below is set.' })
  type: PaymentMethodType;

  @ApiProperty({ type: () => CardDetailsDto, nullable: true, description: 'Card details when `type` is `card`, otherwise `null`.' })
  card: CardDetailsDto | null;

  @ApiProperty({ enum: WalletType, enumName: 'WalletType', nullable: true, example: null, description: 'Wallet when `type` is `wallet`, otherwise `null`.' })
  wallet: WalletType | null;

  @ApiProperty({ type: () => BankTransferInstructionsDto, nullable: true, description: 'Where to send the money when `type` is `bank_transfer`, otherwise `null`.' })
  bankTransfer: BankTransferInstructionsDto | null;
}

export class RefundDto {
  /**
   * Refund id.
   * @example "re_c81Hq0"
   */
  id: string;

  /**
   * Payment refunded.
   * @example "pay_3kTq9Z"
   */
  paymentId: string;

  /**
   * Amount refunded, in cents.
   * @example 1299900
   */
  amount: number;

  /**
   * ISO 4217 currency code.
   * @example "USD"
   */
  currency: string;

  @ApiProperty({ enum: RefundReason, enumName: 'RefundReason', example: RefundReason.RequestedByCustomer, description: 'Why the money went back.' })
  reason: RefundReason;

  @ApiProperty({ enum: RefundStatus, enumName: 'RefundStatus', example: RefundStatus.Succeeded, description: 'Bank transfer refunds stay `pending` for a few days.' })
  status: RefundStatus;

  @ApiProperty({ format: 'date-time', example: '2026-10-05T10:00:00Z', description: 'When the refund was created.' })
  createdAt: string;
}

export class PaymentDto {
  /**
   * Payment id.
   * @example "pay_3kTq9Z"
   */
  id: string;

  /**
   * Booking paid for.
   * @example "bk_7Hq2xP"
   */
  bookingId: string;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus', example: PaymentStatus.Succeeded, description: 'Where the payment is in its life.' })
  status: PaymentStatus;

  /**
   * Amount charged, in cents (the booking total).
   * @example 1299900
   */
  amount: number;

  /**
   * Amount refunded so far, in cents.
   * @example 0
   */
  amountRefunded: number;

  /**
   * ISO 4217 currency code.
   * @example "USD"
   */
  currency: string;

  /** How the customer paid. */
  method: PaymentMethodDetailsDto;

  @ApiProperty({ type: String, nullable: true, example: 'card_declined', description: 'Machine-readable reason when `status` is `failed`, otherwise `null`.' })
  failureCode: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'The card was declined.', description: 'Reason for people when `status` is `failed`, otherwise `null`.' })
  failureMessage: string | null;

  /** Refunds of this payment, oldest first. */
  refunds: RefundDto[];

  @ApiProperty(metadata())
  metadata: Record<string, string>;

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:01:00Z', description: 'When the payment was created.' })
  createdAt: string;
}

export class CreateRefundDto {
  /**
   * Amount to refund, in cents. Defaults to everything not yet refunded.
   * @example 50000
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiProperty({ enum: RefundReason, enumName: 'RefundReason', example: RefundReason.RequestedByCustomer, description: 'Why you are refunding.' })
  @IsEnum(RefundReason)
  reason: RefundReason;
}
