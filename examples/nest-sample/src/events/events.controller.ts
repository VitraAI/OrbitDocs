import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiExtraModels, ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@orbitdocs/nestjs';

import { BookingDto } from '../bookings/booking.dto';
import { Authenticated } from '../common/auth';
import { paginate } from '../common/pagination.dto';
import { RateLimited } from '../common/rate-limit';
import { PaymentDto } from '../payments/payment.dto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EventDto, EventListDto, ListEventsQueryDto } from './event.dto';

@Controller({ path: 'events', version: '1' })
@Authenticated()
@RateLimited()
@ApiExtraModels(BookingDto, PaymentDto)
export class EventsController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Lists events from the last 30 days, newest first: the same payloads
   * webhooks deliver. Use it to catch up after downtime, or instead of
   * webhooks if you cannot receive them.
   */
  @Get()
  @DocsOperation({ group: 'Events', title: 'List events', order: 1 })
  list(@Query() query: ListEventsQueryDto): EventListDto {
    const items = this.webhooks.events.filter(
      (e) =>
        (!query.type || e.type === query.type) &&
        (!query.createdGte || Date.parse(e.createdAt) >= Date.parse(query.createdGte)) &&
        (!query.createdLte || Date.parse(e.createdAt) <= Date.parse(query.createdLte)),
    );
    return paginate(items, query);
  }

  /**
   * Returns one event. Webhook deliveries carry its `id`: fetch it to check a
   * delivery is genuine without verifying the signature.
   */
  @Get(':id')
  @DocsOperation({ group: 'Events', title: 'Get an event', order: 2 })
  @DocsErrors({ 404: 'No event with this id.' })
  @ApiParam({ name: 'id', description: 'Event id.', example: 'evt_N3wB9k' })
  get(@Param('id') id: string): EventDto {
    const found = this.webhooks.events.find((e) => e.id === id);
    if (!found) throw new NotFoundException(`Event ${id} not found`);
    return found;
  }
}
