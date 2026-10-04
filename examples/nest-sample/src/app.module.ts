import { Module } from '@nestjs/common';

import { BookingsController } from './bookings/bookings.controller';
import { DestinationsController } from './destinations/destinations.controller';
import { DocsHookController } from './docs-hook/docs-hook.controller';
import { EventsController } from './events/events.controller';
import { FlightsController } from './flights/flights.controller';
import { HealthController } from './health/health.controller';
import { LoyaltyController } from './loyalty/loyalty.controller';
import { OAuthController } from './oauth/oauth.controller';
import { PassengersController } from './passengers/passengers.controller';
import { PaymentsController } from './payments/payments.controller';
import { SeatsController } from './seats/seats.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksService } from './webhooks/webhooks.service';

@Module({
  // Order sets the reference's group order: Authentication, Destinations, Flights, Seats, Bookings, …
  controllers: [
    OAuthController,
    DestinationsController,
    FlightsController,
    SeatsController,
    BookingsController,
    PassengersController,
    PaymentsController,
    LoyaltyController,
    EventsController,
    WebhooksController,
    HealthController,
    DocsHookController,
  ],
  providers: [WebhooksService],
})
export class AppModule {}
