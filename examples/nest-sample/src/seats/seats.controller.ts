import { Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@vitra-ai/orbitdocs-nestjs';

import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { RateLimited } from '../common/rate-limit';
import { FlightDto } from '../flights/flight.dto';
import { FLIGHTS } from '../flights/flights.controller';
import { CreateSeatHoldDto, SeatHoldDto, SeatHoldStatus, SeatMapDto, SeatMapQueryDto, SeatStatus } from './seat.dto';
import { cabinMaps, findSeat, HOLD_SECONDS, SEAT_HOLDS } from './seat-map';

const flightParam = ApiParam({ name: 'id', description: 'Flight id.', example: 'flt_2031_proxima' });

@Controller({ path: 'flights', version: '1' })
@Authenticated()
@RateLimited()
export class SeatsController {
  /**
   * Returns the seat map of a flight: every cabin, row and seat, with what is
   * free right now. Seats in the exit row cost extra.
   */
  @Get(':id/seats')
  @DocsOperation({ group: 'Seats', title: 'Get a seat map', order: 1 })
  @DocsErrors({ 404: 'No flight with this id.' })
  @flightParam
  seatMap(@Param('id') id: string, @Query() query: SeatMapQueryDto): SeatMapDto {
    const flight = this.flight(id);
    const cabins = cabinMaps(flight).filter((c) => !query.cabin || c.cabin === query.cabin);
    return { flightId: flight.id, vessel: 'Orbit Clipper OC-9', holdDurationSeconds: HOLD_SECONDS, cabins };
  }

  /**
   * Holds seats for 15 minutes while your customer finishes checking out.
   * Assign them with Update a booking (`holdId`) before `expiresAt`, or they
   * are released.
   */
  @Post(':id/seat-holds')
  @DocsOperation({ group: 'Seats', title: 'Hold seats', order: 2 })
  @DocsErrors({ 404: 'No flight with this id.', 409: 'A seat is taken or already held.', 422: 'A seat does not exist on this flight, or the seats span cabins.' })
  @flightParam
  hold(@Param('id') id: string, @Body() dto: CreateSeatHoldDto): SeatHoldDto {
    const flight = this.flight(id);
    const found = dto.seats.map((number) => {
      const match = findSeat(flight, number);
      if (!match) throw new UnprocessableEntityException(`Seat ${number} does not exist on flight ${flight.id}`);
      if (match.seat.status !== SeatStatus.Available) throw new ConflictException(`Seat ${number} is ${match.seat.status}`);
      return match;
    });
    const cabins = new Set(found.map((f) => f.cabin));
    if (cabins.size > 1) throw new UnprocessableEntityException('All seats in a hold must be in one cabin');
    const now = Date.now();
    const hold: SeatHoldDto = {
      id: newId('sh'),
      flightId: flight.id,
      cabin: found[0]!.cabin,
      seats: [...new Set(dto.seats)],
      status: SeatHoldStatus.Active,
      expiresAt: new Date(now + HOLD_SECONDS * 1000).toISOString(),
      createdAt: new Date(now).toISOString(),
    };
    SEAT_HOLDS.unshift(hold);
    return hold;
  }

  private flight(id: string): FlightDto {
    const flight = FLIGHTS.find((f) => f.id === id);
    if (!flight) throw new NotFoundException(`Flight ${id} not found`);
    return flight;
  }
}
