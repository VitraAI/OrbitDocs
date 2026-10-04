import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PageInfoDto, PageQueryDto } from '../common/pagination.dto';

export enum Climate {
  Temperate = 'temperate',
  Arid = 'arid',
  Frozen = 'frozen',
  Oceanic = 'oceanic',
}

export class DestinationDto {
  /**
   * Destination id.
   * @example "dst_kepler22b"
   */
  id: string;

  /**
   * Display name.
   * @example "Kepler-22b"
   */
  name: string;

  /**
   * Star system it orbits.
   * @example "Kepler-22"
   */
  system: string;

  /** Typical surface conditions. */
  @ApiProperty({ enum: Climate, enumName: 'Climate', example: Climate.Oceanic })
  climate: Climate;

  /**
   * Distance from Earth in light years.
   * @example 638
   */
  distanceLy: number;

  /**
   * Gravity relative to Earth (1.0 = Earth).
   * @example 2.4
   */
  gravity: number;
}

export class ListDestinationsQueryDto extends PageQueryDto {
  /** Only destinations with this climate. */
  @IsOptional()
  @IsEnum(Climate)
  @ApiProperty({ enum: Climate, enumName: 'Climate', required: false })
  climate?: Climate;
}

export class DestinationListDto {
  /** Destinations on this page. */
  data: DestinationDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}
