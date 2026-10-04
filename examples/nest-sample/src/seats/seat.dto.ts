import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsOptional, Matches } from 'class-validator';

import { CabinClass } from '../flights/flight.dto';

export enum SeatStatus {
  Available = 'available',
  Held = 'held',
  Occupied = 'occupied',
  Blocked = 'blocked',
}

export enum SeatFeature {
  Window = 'window',
  Aisle = 'aisle',
  ExtraLegroom = 'extra_legroom',
  ExitRow = 'exit_row',
  Viewport = 'viewport',
}

export enum SeatHoldStatus {
  Active = 'active',
  Used = 'used',
  Expired = 'expired',
}

export class SeatMapQueryDto {
  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', required: false, description: 'Only this cabin.' })
  @IsOptional()
  @IsEnum(CabinClass)
  cabin?: CabinClass;
}

export class SeatPriceDto {
  /**
   * Extra charge in cents.
   * @example 4900
   */
  amount: number;

  /**
   * ISO 4217 currency code.
   * @example "USD"
   */
  currency: string;
}

export class SeatDto {
  /**
   * Seat number: row and column.
   * @example "24A"
   */
  number: string;

  /**
   * Column letter.
   * @example "A"
   */
  column: string;

  @ApiProperty({ enum: SeatStatus, enumName: 'SeatStatus', example: SeatStatus.Available, description: 'Whether the seat can be held.' })
  status: SeatStatus;

  @ApiProperty({ enum: SeatFeature, enumName: 'SeatFeature', isArray: true, example: [SeatFeature.Window, SeatFeature.ExtraLegroom], description: 'What makes this seat different.' })
  features: SeatFeature[];

  @ApiProperty({ type: () => SeatPriceDto, nullable: true, description: 'Extra charge for this seat; `null` when it is included in the fare.' })
  price: SeatPriceDto | null;
}

export class SeatRowDto {
  /**
   * Row number.
   * @example 24
   */
  number: number;

  /** Seats in the row, left to right. */
  seats: SeatDto[];
}

export class CabinSeatMapDto {
  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', example: CabinClass.Economy, description: 'Cabin.' })
  cabin: CabinClass;

  /**
   * Column letters, left to right; an empty string marks an aisle.
   * @example ["A", "B", "C", "", "D", "E", "F"]
   */
  layout: string[];

  /** Rows, front to back. */
  rows: SeatRowDto[];
}

export class SeatMapDto {
  /**
   * Flight id.
   * @example "flt_2031_proxima"
   */
  flightId: string;

  /**
   * Vessel type.
   * @example "Orbit Clipper OC-9"
   */
  vessel: string;

  /**
   * How long a seat hold lasts, in seconds.
   * @example 900
   */
  holdDurationSeconds: number;

  /** One map per cabin the flight sells. */
  cabins: CabinSeatMapDto[];
}

export class CreateSeatHoldDto {
  /**
   * Seats to hold, all in one cabin. Up to nine.
   * @example ["24A", "24B"]
   */
  @Matches(/^\d{1,2}[A-F]$/, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  seats: string[];
}

export class SeatHoldDto {
  /**
   * Hold id. Pass it as `holdId` to Update a booking.
   * @example "sh_Lq83Zt"
   */
  id: string;

  /**
   * Flight id.
   * @example "flt_2031_proxima"
   */
  flightId: string;

  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', example: CabinClass.Economy, description: 'Cabin of the held seats.' })
  cabin: CabinClass;

  /**
   * Seats held.
   * @example ["24A", "24B"]
   */
  seats: string[];

  @ApiProperty({ enum: SeatHoldStatus, enumName: 'SeatHoldStatus', example: SeatHoldStatus.Active, description: 'Active until it is used on a booking or expires.' })
  status: SeatHoldStatus;

  @ApiProperty({ format: 'date-time', example: '2026-10-04T09:15:00Z', description: 'When the seats are released if the hold is not used.' })
  expiresAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-04T09:00:00Z', description: 'When the hold was created.' })
  createdAt: string;
}
