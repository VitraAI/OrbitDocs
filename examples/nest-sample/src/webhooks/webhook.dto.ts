import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsEnum, IsOptional, IsUrl } from 'class-validator';

export enum WebhookEvent {
  BookingConfirmed = 'booking.confirmed',
  BookingChanged = 'booking.changed',
  BookingCancelled = 'booking.cancelled',
  PaymentSucceeded = 'payment.succeeded',
  PaymentFailed = 'payment.failed',
}

export enum WebhookDeliveryStatus {
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export class CreateWebhookEndpointDto {
  /**
   * HTTPS URL that receives events.
   * @example "https://example.com/webhooks/orbit"
   */
  @IsUrl({ protocols: ['https'] })
  url: string;

  @ApiProperty({ enum: WebhookEvent, enumName: 'WebhookEvent', isArray: true, example: [WebhookEvent.BookingConfirmed], description: 'Events to send.' })
  @IsEnum(WebhookEvent, { each: true })
  @ArrayMinSize(1)
  events: WebhookEvent[];
}

export class WebhookEndpointDto {
  /**
   * Endpoint id.
   * @example "whe_91ka2"
   */
  id: string;

  /**
   * Receiving URL.
   * @example "https://example.com/webhooks/orbit"
   */
  url: string;

  @ApiProperty({ enum: WebhookEvent, enumName: 'WebhookEvent', isArray: true, example: [WebhookEvent.BookingConfirmed], description: 'Events sent.' })
  events: WebhookEvent[];

  /**
   * Secret used to sign deliveries (`Orbit-Signature` header, HMAC-SHA256). Shown once.
   * @example "whsec_3b1f9e0c"
   */
  secret: string;
}

export class WebhookEndpointListDto {
  /** Your endpoints. */
  data: WebhookEndpointDto[];
}

export class TestWebhookEndpointDto {
  @ApiProperty({ enum: WebhookEvent, enumName: 'WebhookEvent', required: false, default: WebhookEvent.BookingConfirmed, description: 'Event type to send, with sample data.' })
  @IsOptional()
  @IsEnum(WebhookEvent)
  type?: WebhookEvent;
}
