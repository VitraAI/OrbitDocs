import { ApiProperty, type ApiPropertyOptions, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsObject, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

import { PageInfoDto, PageQueryDto } from '../common/pagination.dto';

export enum SeatPreference {
  Window = 'window',
  Aisle = 'aisle',
  NoPreference = 'no_preference',
}

export enum MealPreference {
  Standard = 'standard',
  Vegetarian = 'vegetarian',
  Vegan = 'vegan',
  Halal = 'halal',
  Kosher = 'kosher',
  None = 'none',
}

/** A string-to-string map of the caller's own data. */
const metadata = (required = true): ApiPropertyOptions => ({
  required,
  type: Object,
  additionalProperties: { type: 'string' },
  example: { crmId: 'cus_10442', segment: 'frequent-flyer' },
  description: 'Up to 20 key-value pairs of your own. Values are strings; send an empty string to remove a key.',
});

export class PassportDto {
  /**
   * Passport number.
   * @example "X49201837"
   */
  @IsString()
  number: string;

  /**
   * Issuing country, ISO 3166-1 alpha-2.
   * @example "GB"
   */
  @Matches(/^[A-Z]{2}$/)
  issuingCountry: string;

  @ApiProperty({ format: 'date', example: '2034-06-30', description: 'Expiry date. Must be valid six months after departure.' })
  @IsDateString()
  expiresOn: string;
}

export class TravelPreferencesDto {
  @ApiProperty({ enum: SeatPreference, enumName: 'SeatPreference', example: SeatPreference.Window, description: 'Preferred seat, used when seats are auto-assigned.' })
  @IsEnum(SeatPreference)
  seat: SeatPreference;

  @ApiProperty({ enum: MealPreference, enumName: 'MealPreference', example: MealPreference.Vegetarian, description: 'Meal served on board.' })
  @IsEnum(MealPreference)
  meal: MealPreference;

  /** Prefers a cryosleep pod on journeys longer than a year. */
  @IsBoolean()
  cryosleep: boolean;
}

export class CreatePassengerDto {
  /**
   * Given name as on the passport.
   * @example "Ada"
   */
  @IsString()
  firstName: string;

  /**
   * Family name as on the passport.
   * @example "Lovelace"
   */
  @IsString()
  lastName: string;

  /**
   * Contact email; unique per account.
   * @example "ada@example.com"
   */
  @IsEmail()
  email: string;

  @ApiProperty({ format: 'date', example: '1990-12-10', description: 'Date of birth.' })
  @IsDateString()
  dateOfBirth: string;

  /**
   * Nationality, ISO 3166-1 alpha-2.
   * @example "GB"
   */
  @Matches(/^[A-Z]{2}$/)
  nationality: string;

  @ApiProperty({ type: () => PassportDto, nullable: true, required: false, description: 'Passport details; `null` when not on file yet.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PassportDto)
  passport?: PassportDto | null;

  @ApiProperty({ type: String, nullable: true, required: false, example: 'OT 4410 2291', description: 'Orbit Miles member number, if any.' })
  @IsOptional()
  @IsString()
  loyaltyNumber?: string | null;

  /** Seat and meal preferences. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TravelPreferencesDto)
  preferences?: TravelPreferencesDto;

  @ApiProperty(metadata(false))
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class UpdateTravelPreferencesDto extends PartialType(TravelPreferencesDto) {}

/** Every field is optional; only the ones you send change. */
export class UpdatePassengerDto extends PartialType(OmitType(CreatePassengerDto, ['preferences'] as const)) {
  /** Preferences to change; the ones you leave out keep their value. */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTravelPreferencesDto)
  preferences?: UpdateTravelPreferencesDto;
}

export class PassengerProfileDto {
  /**
   * Passenger id.
   * @example "psg_8Fk2Lm"
   */
  id: string;

  /**
   * Given name as on the passport.
   * @example "Ada"
   */
  firstName: string;

  /**
   * Family name as on the passport.
   * @example "Lovelace"
   */
  lastName: string;

  /**
   * Contact email.
   * @example "ada@example.com"
   */
  email: string;

  @ApiProperty({ format: 'date', example: '1990-12-10', description: 'Date of birth.' })
  dateOfBirth: string;

  /**
   * Nationality, ISO 3166-1 alpha-2.
   * @example "GB"
   */
  nationality: string;

  @ApiProperty({ type: () => PassportDto, nullable: true, description: 'Passport details; `null` when not on file yet.' })
  passport: PassportDto | null;

  @ApiProperty({ type: String, nullable: true, example: 'OT 4410 2291', description: 'Orbit Miles member number, or `null`.' })
  loyaltyNumber: string | null;

  /** Seat and meal preferences. */
  preferences: TravelPreferencesDto;

  @ApiProperty(metadata())
  metadata: Record<string, string>;

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:00:00Z', description: 'When the passenger was saved.' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-04T08:15:00Z', description: 'When the passenger last changed.' })
  updatedAt: string;
}

export class ListPassengersQueryDto extends PageQueryDto {
  /**
   * Only the passenger with this email.
   * @example "ada@example.com"
   */
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PassengerListDto {
  /** Passengers on this page, newest first. */
  data: PassengerProfileDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}
