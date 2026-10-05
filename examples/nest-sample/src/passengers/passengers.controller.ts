import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { DocsErrors, DocsOperation } from '@vitra-ai/orbitdocs-nestjs';

import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { paginate } from '../common/pagination.dto';
import { RateLimited } from '../common/rate-limit';
import {
  CreatePassengerDto,
  ListPassengersQueryDto,
  MealPreference,
  PassengerListDto,
  PassengerProfileDto,
  SeatPreference,
  UpdatePassengerDto,
} from './passenger.dto';

const DEFAULT_PREFERENCES = { seat: SeatPreference.NoPreference, meal: MealPreference.Standard, cryosleep: false };

export const PASSENGERS: PassengerProfileDto[] = [
  {
    id: 'psg_8Fk2Lm',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    dateOfBirth: '1990-12-10',
    nationality: 'GB',
    passport: { number: 'X49201837', issuingCountry: 'GB', expiresOn: '2034-06-30' },
    loyaltyNumber: 'OT 4410 2291',
    preferences: { seat: SeatPreference.Window, meal: MealPreference.Vegetarian, cryosleep: true },
    metadata: { crmId: 'cus_10442' },
    createdAt: '2026-10-03T12:00:00Z',
    updatedAt: '2026-10-03T12:00:00Z',
  },
];

const idParam = ApiParam({ name: 'id', description: 'Passenger id.', example: 'psg_8Fk2Lm' });

/** Applies `metadata` changes: new keys are added, empty strings remove a key. */
function mergeMetadata(current: Record<string, string>, changes: Record<string, string> = {}): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (value === '') delete next[key];
    else next[key] = String(value);
  }
  return next;
}

@Controller({ path: 'passengers', version: '1' })
@Authenticated()
@RateLimited()
export class PassengersController {
  /**
   * Saves a passenger profile so you can book them again without retyping
   * their passport details.
   */
  @Post()
  @DocsOperation({ group: 'Passengers', title: 'Create a passenger', order: 1 })
  @DocsErrors({ 409: 'A passenger with this email already exists.' })
  create(@Body() dto: CreatePassengerDto): PassengerProfileDto {
    if (PASSENGERS.some((p) => p.email === dto.email)) throw new ConflictException(`A passenger with email ${dto.email} already exists`);
    const now = new Date().toISOString();
    const passenger: PassengerProfileDto = {
      id: newId('psg'),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dateOfBirth: dto.dateOfBirth,
      nationality: dto.nationality,
      passport: dto.passport ?? null,
      loyaltyNumber: dto.loyaltyNumber ?? null,
      preferences: { ...DEFAULT_PREFERENCES, ...dto.preferences },
      metadata: mergeMetadata({}, dto.metadata),
      createdAt: now,
      updatedAt: now,
    };
    PASSENGERS.unshift(passenger);
    return passenger;
  }

  /**
   * Lists saved passengers, newest first. Filter by email to find one.
   */
  @Get()
  @DocsOperation({ group: 'Passengers', title: 'List passengers', order: 2 })
  list(@Query() query: ListPassengersQueryDto): PassengerListDto {
    const items = query.email ? PASSENGERS.filter((p) => p.email === query.email) : PASSENGERS;
    return paginate(items, query);
  }

  /**
   * Returns one saved passenger.
   */
  @Get(':id')
  @DocsOperation({ group: 'Passengers', title: 'Get a passenger', order: 3 })
  @DocsErrors({ 404: 'No passenger with this id.' })
  @idParam
  get(@Param('id') id: string): PassengerProfileDto {
    return this.find(id);
  }

  /**
   * Changes some fields of a passenger; fields you leave out keep their
   * value. Send `passport: null` to remove the passport, and an empty string
   * for a `metadata` key to remove that key.
   */
  @Patch(':id')
  @DocsOperation({ group: 'Passengers', title: 'Update a passenger', order: 4 })
  @DocsErrors({ 404: 'No passenger with this id.', 409: 'Another passenger already has this email.' })
  @idParam
  update(@Param('id') id: string, @Body() dto: UpdatePassengerDto): PassengerProfileDto {
    const passenger = this.find(id);
    if (dto.email && dto.email !== passenger.email && PASSENGERS.some((p) => p.email === dto.email)) {
      throw new ConflictException(`A passenger with email ${dto.email} already exists`);
    }
    const { metadata, preferences, ...fields } = dto;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (passenger as unknown as Record<string, unknown>)[key] = value;
    }
    if (preferences) passenger.preferences = { ...passenger.preferences, ...preferences };
    passenger.metadata = mergeMetadata(passenger.metadata, metadata);
    passenger.updatedAt = new Date().toISOString();
    return passenger;
  }

  /**
   * Deletes a saved passenger. Bookings they are on are not affected.
   */
  @Delete(':id')
  @HttpCode(204)
  @DocsOperation({ group: 'Passengers', title: 'Delete a passenger', order: 5 })
  @DocsErrors({ 404: 'No passenger with this id.' })
  @idParam
  remove(@Param('id') id: string): void {
    const i = PASSENGERS.findIndex((p) => p.id === id);
    if (i === -1) throw new NotFoundException(`Passenger ${id} not found`);
    PASSENGERS.splice(i, 1);
  }

  private find(id: string): PassengerProfileDto {
    const passenger = PASSENGERS.find((p) => p.id === id);
    if (!passenger) throw new NotFoundException(`Passenger ${id} not found`);
    return passenger;
  }
}
