import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@orbitdocs/nestjs';
import type { Response } from 'express';

import { Authenticated } from '../common/auth';
import { paginate } from '../common/pagination.dto';
import { RateLimited, ResponseHeaders } from '../common/rate-limit';
import { CabinClass, FlightDto, FlightListDto, LegacyFlightSearchDto, LegacySearchFlightsQueryDto, SearchFlightsQueryDto } from './flight.dto';

const SUNSET = 'Wed, 31 Mar 2032 00:00:00 GMT';

export const FLIGHTS: FlightDto[] = [
  {
    id: 'flt_2031_proxima',
    from: 'KSC',
    destinationId: 'dst_proxima_b',
    departsAt: '2031-04-12T08:00:00Z',
    durationDays: 210,
    fares: [
      { cabin: CabinClass.Economy, amount: 1299900, currency: 'USD', seatsLeft: 12 },
      { cabin: CabinClass.Cryosleep, amount: 2499900, currency: 'USD', seatsLeft: 3 },
    ],
  },
  {
    id: 'flt_2032_trappist',
    from: 'BAI',
    destinationId: 'dst_trappist1e',
    departsAt: '2032-09-01T14:30:00Z',
    durationDays: 940,
    fares: [{ cabin: CabinClass.Cryosleep, amount: 8999900, currency: 'USD', seatsLeft: 40 }],
  },
];

@Controller({ path: 'flights', version: '1' })
@Authenticated()
@RateLimited()
export class FlightsController {
  /**
   * Searches scheduled flights. Results are ordered by departure time.
   */
  @Get()
  @DocsOperation({ group: 'Flights', title: 'Search flights', order: 1 })
  search(@Query() query: SearchFlightsQueryDto): FlightListDto {
    const items = FLIGHTS.filter(
      (f) =>
        (!query.destinationId || f.destinationId === query.destinationId) &&
        (!query.departsAfter || f.departsAt >= query.departsAfter),
    );
    return paginate(items, query);
  }

  /**
   * The first flight search, with page numbers instead of cursors. It is
   * slower on large result sets and is switched off on 31 March 2032.
   *
   * > [!WARNING]
   * > Deprecated: use [Search flights](#search-flights). Rename `destination`
   * > to `destinationId`, and follow `page.nextCursor` instead of counting pages.
   */
  @Get('search-legacy')
  @DocsOperation({ group: 'Flights', title: 'Legacy flight search', order: 3, stability: 'deprecated' })
  @ResponseHeaders(200, {
    Deprecation: { description: 'Always `true`: this endpoint is deprecated.', schema: { type: 'string', example: 'true' } },
    Sunset: { description: 'When the endpoint stops working (HTTP date).', schema: { type: 'string', example: SUNSET } },
    Link: { description: 'The replacement endpoint.', schema: { type: 'string', example: '</v1/flights>; rel="successor-version"' } },
  })
  searchLegacy(@Query() query: LegacySearchFlightsQueryDto, @Res({ passthrough: true }) res: Response): LegacyFlightSearchDto {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', SUNSET);
    res.setHeader('Link', '</v1/flights>; rel="successor-version"');
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 10;
    const items = FLIGHTS.filter((f) => !query.destination || f.destinationId === query.destination);
    return { results: items.slice((page - 1) * perPage, page * perPage), total: items.length, page, perPage };
  }

  /**
   * Returns one flight with its current fares and seat availability.
   */
  @Get(':id')
  @DocsOperation({ group: 'Flights', title: 'Get a flight', order: 2 })
  @DocsErrors({ 404: 'No flight with this id.' })
  @ApiParam({ name: 'id', description: 'Flight id.', example: 'flt_2031_proxima' })
  get(@Param('id') id: string): FlightDto {
    const found = FLIGHTS.find((f) => f.id === id);
    if (!found) throw new NotFoundException(`Flight ${id} not found`);
    return found;
  }
}
