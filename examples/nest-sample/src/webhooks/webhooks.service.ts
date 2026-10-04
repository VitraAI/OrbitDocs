import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { BOOKINGS } from '../bookings/bookings.store';
import { newId } from '../common/id';
import { EventDto } from '../events/event.dto';
import { PAYMENTS } from '../payments/payments.store';
import { WebhookDeliveryDto } from './webhook-delivery.dto';
import { WebhookDeliveryStatus, WebhookEndpointDto, WebhookEvent } from './webhook.dto';

export const API_VERSION = '2031-01-01';

/** Events, newest first. Seeded with the history of the sample bookings. */
const EVENTS: EventDto[] = [
  { id: 'evt_P4yM2c', type: WebhookEvent.PaymentSucceeded, apiVersion: API_VERSION, data: { object: structuredClone(PAYMENTS[0]!), previousAttributes: null }, createdAt: '2026-10-03T12:01:01Z' },
  { id: 'evt_N3wB9k', type: WebhookEvent.BookingConfirmed, apiVersion: API_VERSION, data: { object: structuredClone(BOOKINGS[0]!), previousAttributes: null }, createdAt: '2026-10-03T12:00:01Z' },
  { id: 'evt_K8rT1v', type: WebhookEvent.BookingConfirmed, apiVersion: API_VERSION, data: { object: structuredClone(BOOKINGS[1]!), previousAttributes: null }, createdAt: '2026-10-02T09:30:01Z' },
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  readonly endpoints: WebhookEndpointDto[] = [
    { id: 'whe_91ka2', url: 'https://example.com/webhooks/orbit', events: Object.values(WebhookEvent), secret: 'whsec_3b1f9e0c' },
  ];
  readonly events = EVENTS;

  /** Records an event (listed by the Events API) and sends it to subscribed endpoints. */
  emit(type: `${WebhookEvent}`, object: unknown, previousAttributes: Record<string, unknown> | null = null): EventDto {
    const event: EventDto = {
      id: newId('evt'),
      type: type as WebhookEvent,
      apiVersion: API_VERSION,
      data: { object: structuredClone(object) as EventDto['data']['object'], previousAttributes },
      createdAt: new Date().toISOString(),
    };
    this.events.unshift(event);
    for (const e of this.endpoints.filter((x) => x.events.includes(event.type))) {
      this.logger.log(`would POST ${type} (${event.id}) to ${e.url}`);
    }
    return event;
  }

  /** Sends one event to one endpoint now and reports how it went. */
  async deliver(endpoint: WebhookEndpointDto, event: EventDto): Promise<WebhookDeliveryDto> {
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex');
    const started = Date.now();
    let responseStatus: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Orbit-Signature': signature, 'Orbit-Event-Id': event.id },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      responseStatus = res.status;
      if (!res.ok) error = `Endpoint answered ${res.status}`;
    } catch (err) {
      error = (err as Error).cause instanceof Error ? ((err as Error).cause as Error).message : (err as Error).message;
    }
    return {
      id: newId('whd'),
      endpointId: endpoint.id,
      status: error ? WebhookDeliveryStatus.Failed : WebhookDeliveryStatus.Succeeded,
      responseStatus,
      error,
      durationMs: Date.now() - started,
      signature,
      event,
      deliveredAt: new Date(started).toISOString(),
    };
  }
}
