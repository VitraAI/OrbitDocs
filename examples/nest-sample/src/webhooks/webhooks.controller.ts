import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@orbitdocs/nestjs';

import { BOOKINGS } from '../bookings/bookings.store';
import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { RateLimited } from '../common/rate-limit';
import { PAYMENTS } from '../payments/payments.store';
import { WebhookDeliveryDto } from './webhook-delivery.dto';
import { CreateWebhookEndpointDto, TestWebhookEndpointDto, WebhookEndpointDto, WebhookEndpointListDto, WebhookEvent } from './webhook.dto';
import { API_VERSION, WebhooksService } from './webhooks.service';

const idParam = ApiParam({ name: 'id', description: 'Endpoint id.', example: 'whe_91ka2' });

@Controller({ path: 'webhook-endpoints', version: '1' })
@Authenticated()
@RateLimited()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Registers a URL to receive booking and payment events. Deliveries are signed with the
   * returned `secret`; verify the `Orbit-Signature` header before trusting them.
   */
  @Post()
  @DocsOperation({ group: 'Webhooks', title: 'Create a webhook endpoint', order: 1 })
  create(@Body() dto: CreateWebhookEndpointDto): WebhookEndpointDto {
    const endpoint = { id: `whe_${Math.random().toString(36).slice(2, 7)}`, ...dto, secret: `whsec_${Math.random().toString(16).slice(2, 10)}` };
    this.webhooks.endpoints.push(endpoint);
    return endpoint;
  }

  /**
   * Lists your webhook endpoints.
   */
  @Get()
  @DocsOperation({ group: 'Webhooks', title: 'List webhook endpoints', order: 2 })
  list(): WebhookEndpointListDto {
    return { data: this.webhooks.endpoints };
  }

  /**
   * Stops deliveries to an endpoint and deletes it.
   */
  @Delete(':id')
  @HttpCode(204)
  @DocsOperation({ group: 'Webhooks', title: 'Delete a webhook endpoint', order: 3 })
  @DocsErrors({ 404: 'No webhook endpoint with this id.' })
  @idParam
  remove(@Param('id') id: string): void {
    const i = this.webhooks.endpoints.findIndex((e) => e.id === id);
    if (i === -1) throw new NotFoundException(`Webhook endpoint ${id} not found`);
    this.webhooks.endpoints.splice(i, 1);
  }

  /**
   * Sends a signed sample event to the endpoint right away and reports how
   * your server answered, so you can check signature verification before
   * real traffic arrives. The endpoint does not have to subscribe to the
   * event type. Test events are not listed by List events.
   */
  @Post(':id/test')
  @HttpCode(200)
  @DocsOperation({ group: 'Webhooks', title: 'Send a test event', order: 4 })
  @DocsErrors({ 404: 'No webhook endpoint with this id.' })
  @idParam
  async test(@Param('id') id: string, @Body() dto: TestWebhookEndpointDto): Promise<WebhookDeliveryDto> {
    const endpoint = this.webhooks.endpoints.find((e) => e.id === id);
    if (!endpoint) throw new NotFoundException(`Webhook endpoint ${id} not found`);
    const type = dto.type ?? WebhookEvent.BookingConfirmed;
    const object = structuredClone(type.startsWith('payment.') ? PAYMENTS[0]! : BOOKINGS[0]!);
    const previousAttributes = type === WebhookEvent.BookingChanged ? { seats: [] } : null;
    const event = { id: newId('evt'), type, apiVersion: API_VERSION, data: { object, previousAttributes }, createdAt: new Date().toISOString() };
    return this.webhooks.deliver(endpoint, event);
  }
}
