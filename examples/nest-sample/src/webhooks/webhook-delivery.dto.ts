import { ApiProperty } from '@nestjs/swagger';

import { EventDto } from '../events/event.dto';
import { WebhookDeliveryStatus } from './webhook.dto';

export class WebhookDeliveryDto {
  /**
   * Delivery id.
   * @example "whd_s0Ue4M"
   */
  id: string;

  /**
   * Endpoint the event was sent to.
   * @example "whe_91ka2"
   */
  endpointId: string;

  @ApiProperty({ enum: WebhookDeliveryStatus, enumName: 'WebhookDeliveryStatus', example: WebhookDeliveryStatus.Succeeded, description: '`succeeded` when your endpoint answered with a 2xx status.' })
  status: WebhookDeliveryStatus;

  @ApiProperty({ type: Number, nullable: true, example: 200, description: 'HTTP status your endpoint answered with; `null` if it could not be reached.' })
  responseStatus: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'connect ECONNREFUSED', description: 'Why the delivery failed; `null` when it succeeded.' })
  error: string | null;

  /**
   * Round trip, in milliseconds.
   * @example 182
   */
  durationMs: number;

  /**
   * `Orbit-Signature` header sent: hex HMAC-SHA256 of the body with the endpoint secret.
   * @example "5d41402abc4b2a76b9719d911017c592ae2f7c1d6a3e8f2b0c4d5e6f7a8b9c0d"
   */
  signature: string;

  /** The event that was sent, exactly as your endpoint received it. */
  event: EventDto;

  @ApiProperty({ format: 'date-time', example: '2026-10-04T09:00:00Z', description: 'When the delivery was attempted.' })
  deliveredAt: string;
}
