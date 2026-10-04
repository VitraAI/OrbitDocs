import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { PageInfoDto, PageQueryDto } from '../common/pagination.dto';

export enum CabinClass {
  Economy = 'economy',
  Business = 'business',
  Cryosleep = 'cryosleep',
}

export class FareDto {
  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', example: CabinClass.Economy, description: 'Cabin.' })
  cabin: CabinClass;

  /**
   * Price in the smallest currency unit (cents).
   * @example 1299900
   */
  amount: number;

  /**
   * ISO 4217 currency code.
   * @example "USD"
   */
  currency: string;

  /**
   * Seats left at this fare.
   * @example 12
   */
  seatsLeft: number;
}

export class FlightDto {
  /**
   * Flight id.
   * @example "flt_2031_proxima"
   */
  id: string;

  /**
   * Departure spaceport code.
   * @example "KSC"
   */
  from: string;

  /**
   * Destination id.
   * @example "dst_proxima_b"
   */
  destinationId: string;

  @ApiProperty({ format: 'date-time', example: '2031-04-12T08:00:00Z', description: 'Departure time (UTC).' })
  departsAt: string;

  /**
   * Journey length in days.
   * @example 210
   */
  durationDays: number;

  /** Available fares, cheapest first. */
  fares: FareDto[];
}

export class SearchFlightsQueryDto extends PageQueryDto {
  /**
   * Destination id to fly to.
   * @example "dst_proxima_b"
   */
  @IsOptional()
  @IsString()
  destinationId?: string;

  @ApiProperty({ format: 'date', required: false, example: '2031-01-01', description: 'Earliest departure date (UTC).' })
  @IsOptional()
  @IsDateString()
  departsAfter?: string;
}

export class FlightListDto {
  /** Flights on this page. */
  data: FlightDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}

export class LegacySearchFlightsQueryDto {
  /**
   * Destination id (renamed `destinationId` in Search flights).
   * @example "dst_proxima_b"
   */
  @IsOptional()
  @IsString()
  destination?: string;

  /**
   * Page number, starting at 1.
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Flights per page.
   * @example 10
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage?: number = 10;
}

export class LegacyFlightSearchDto {
  /** Flights on this page. */
  results: FlightDto[];

  /**
   * Flights matching the search, on all pages.
   * @example 2
   */
  total: number;

  /**
   * This page number.
   * @example 1
   */
  page: number;

  /**
   * Flights per page.
   * @example 10
   */
  perPage: number;
}
