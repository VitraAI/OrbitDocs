import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@vitra-ai/orbitdocs-nestjs';

import { Authenticated } from '../common/auth';
import { paginate } from '../common/pagination.dto';
import { RateLimited } from '../common/rate-limit';
import { Climate, DestinationDto, DestinationListDto, ListDestinationsQueryDto } from './destination.dto';

export const DESTINATIONS: DestinationDto[] = [
  { id: 'dst_kepler22b', name: 'Kepler-22b', system: 'Kepler-22', climate: Climate.Oceanic, distanceLy: 638, gravity: 2.4 },
  { id: 'dst_proxima_b', name: 'Proxima b', system: 'Alpha Centauri', climate: Climate.Temperate, distanceLy: 4.2, gravity: 1.1 },
  { id: 'dst_trappist1e', name: 'TRAPPIST-1e', system: 'TRAPPIST-1', climate: Climate.Temperate, distanceLy: 40.7, gravity: 0.93 },
  { id: 'dst_lhs1140b', name: 'LHS 1140 b', system: 'LHS 1140', climate: Climate.Frozen, distanceLy: 48.8, gravity: 3.3 },
];

@Controller({ path: 'destinations', version: '1' })
@Authenticated()
@RateLimited()
export class DestinationsController {
  /**
   * Lists the destinations you can book, newest first. Filter by climate.
   */
  @Get()
  @DocsOperation({ group: 'Destinations', title: 'List destinations', order: 1 })
  list(@Query() query: ListDestinationsQueryDto): DestinationListDto {
    const items = query.climate ? DESTINATIONS.filter((d) => d.climate === query.climate) : DESTINATIONS;
    return paginate(items, query);
  }

  /**
   * Returns one destination with its travel conditions.
   */
  @Get(':id')
  @DocsOperation({ group: 'Destinations', title: 'Get a destination', order: 2 })
  @DocsErrors({ 404: 'No destination with this id.' })
  @ApiParam({ name: 'id', description: 'Destination id.', example: 'dst_kepler22b' })
  get(@Param('id') id: string): DestinationDto {
    const found = DESTINATIONS.find((d) => d.id === id);
    if (!found) throw new NotFoundException(`Destination ${id} not found`);
    return found;
  }
}
