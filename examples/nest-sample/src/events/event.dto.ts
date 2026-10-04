import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import { BookingDto } from '../bookings/booking.dto';
import { PageInfoDto, PageQueryDto } from '../common/pagination.dto';
import { PaymentDto } from '../payments/payment.dto';
import { WebhookEvent } from '../webhooks/webhook.dto';

export class EventDataDto {
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(BookingDto) }, { $ref: getSchemaPath(PaymentDto) }],
    description: 'The object the event is about, as it was right after the change: a booking for `booking.*` events, a payment for `payment.*` events.',
  })
  object: BookingDto | PaymentDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { seats: [] },
    description: 'For `booking.changed`: the changed fields with their previous values. `null` for other events.',
  })
  previousAttributes: Record<string, unknown> | null;
}

export class EventDto {
  /**
   * Event id. Deliveries of the same event share it, so use it to skip duplicates.
   * @example "evt_N3wB9k"
   */
  id: string;

  @ApiProperty({ enum: WebhookEvent, enumName: 'WebhookEvent', example: WebhookEvent.BookingConfirmed, description: 'What happened.' })
  type: WebhookEvent;

  /**
   * API version the payload is shaped by.
   * @example "2031-01-01"
   */
  apiVersion: string;

  /** What changed. */
  data: EventDataDto;

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:00:01Z', description: 'When the event happened.' })
  createdAt: string;
}

export class ListEventsQueryDto extends PageQueryDto {
  @ApiProperty({ enum: WebhookEvent, enumName: 'WebhookEvent', required: false, description: 'Only events of this type.' })
  @IsOptional()
  @IsEnum(WebhookEvent)
  type?: WebhookEvent;

  @ApiProperty({ name: 'created[gte]', format: 'date-time', required: false, example: '2026-10-01T00:00:00Z', description: 'Only events created at or after this time.' })
  @Expose({ name: 'created[gte]' })
  @IsOptional()
  @IsDateString({}, { message: 'created[gte] must be an ISO 8601 date-time' })
  createdGte?: string;

  @ApiProperty({ name: 'created[lte]', format: 'date-time', required: false, example: '2026-10-31T23:59:59Z', description: 'Only events created at or before this time.' })
  @Expose({ name: 'created[lte]' })
  @IsOptional()
  @IsDateString({}, { message: 'created[lte] must be an ISO 8601 date-time' })
  createdLte?: string;
}

export class EventListDto {
  /** Events on this page, newest first. */
  data: EventDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}
