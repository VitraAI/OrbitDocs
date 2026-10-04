import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

import { PageInfoDto } from '../common/pagination.dto';
import { CabinClass } from '../flights/flight.dto';

export enum BookingStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
}

export class PassengerDto {
  /**
   * Full name as on the travel document.
   * @example "Ada Lovelace"
   */
  @IsString()
  name: string;

  /**
   * Contact email for boarding updates.
   * @example "ada@example.com"
   */
  @IsEmail()
  email: string;
}

export class CreateBookingDto {
  /**
   * Flight to book.
   * @example "flt_2031_proxima"
   */
  @IsString()
  flightId: string;

  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', example: CabinClass.Economy, description: 'Cabin to book.' })
  @IsEnum(CabinClass)
  cabin: CabinClass;

  /** Everyone travelling. At least one. */
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  @ArrayMinSize(1)
  passengers: PassengerDto[];

  /**
   * Your own reference, echoed back in webhooks.
   * @example "order-8812"
   */
  @IsOptional()
  @IsString()
  reference?: string;
}

export class BookingDto {
  /**
   * Booking id.
   * @example "bk_7Hq2xP"
   */
  id: string;

  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus', example: BookingStatus.Confirmed, description: 'Where the booking is in its life.' })
  status: BookingStatus;

  /**
   * Flight booked.
   * @example "flt_2031_proxima"
   */
  flightId: string;

  @ApiProperty({ enum: CabinClass, enumName: 'CabinClass', example: CabinClass.Economy, description: 'Cabin booked.' })
  cabin: CabinClass;

  /** Everyone travelling. */
  passengers: PassengerDto[];

  /**
   * Total charged, in cents.
   * @example 2599800
   */
  totalAmount: number;

  /**
   * ISO 4217 currency code.
   * @example "USD"
   */
  currency: string;

  /**
   * Your reference, if you sent one.
   * @example "order-8812"
   */
  reference?: string;

  /**
   * Travel documents uploaded for this booking.
   * @example ["passport-ada.pdf"]
   */
  documents: string[];

  /**
   * Seat numbers, one per passenger in the same order. Empty until seats are
   * chosen with Update a booking.
   * @example ["24A", "24B"]
   */
  seats: string[];

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:00:00Z', description: 'When the booking was created.' })
  createdAt: string;
}

export class BookingListDto {
  /** Bookings on this page, newest first. */
  data: BookingDto[];
  /** Pagination cursor. */
  page: PageInfoDto;
}

export class CancelBookingDto {
  /**
   * Why the booking is cancelled (kept for your records).
   * @example "Passenger request"
   */
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Passport or visa scan (PDF, PNG or JPEG, up to 10 MB).' })
  file: unknown;
}

export class UpdateBookingDto {
  /** Corrected passenger details, same number and order as on the booking. To add or remove passengers, cancel and book again. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  passengers?: PassengerDto[];

  /**
   * Seat numbers, one per passenger in the same order. Each must be free,
   * held by `holdId`, or already on this booking.
   * @example ["24A", "24B"]
   */
  @IsOptional()
  @Matches(/^\d{1,2}[A-F]$/, { each: true })
  @ArrayMinSize(1)
  seats?: string[];

  /**
   * Seat hold whose seats you are assigning; it is used up.
   * @example "sh_Lq83Zt"
   */
  @IsOptional()
  @IsString()
  holdId?: string;

  @ApiProperty({ type: String, nullable: true, required: false, example: 'order-8812-b', description: 'Your reference; `null` removes it.' })
  @IsOptional()
  @IsString()
  reference?: string | null;
}

export enum DocumentKind {
  Passport = 'passport',
  Visa = 'visa',
  HealthCertificate = 'health_certificate',
  Other = 'other',
}

export enum DocumentStatus {
  PendingReview = 'pending_review',
  Verified = 'verified',
  Rejected = 'rejected',
}

export class TravelDocumentDto {
  /**
   * Document id.
   * @example "doc_Pz71aQ"
   */
  id: string;

  @ApiProperty({ enum: DocumentKind, enumName: 'DocumentKind', example: DocumentKind.Passport, description: 'What the document is, detected from the scan.' })
  kind: DocumentKind;

  /**
   * File name as uploaded.
   * @example "passport-ada.pdf"
   */
  fileName: string;

  @ApiProperty({ enum: ['application/pdf', 'image/png', 'image/jpeg'], example: 'application/pdf', description: 'Media type of the file.' })
  contentType: string;

  /**
   * File size in bytes.
   * @example 482113
   */
  sizeBytes: number;

  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus', example: DocumentStatus.Verified, description: 'Review status. Boarding needs a verified passport.' })
  status: DocumentStatus;

  @ApiProperty({ type: String, nullable: true, example: 'The photo page is blurred.', description: 'Why the document was rejected; `null` unless `status` is `rejected`.' })
  rejectionReason: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-03T12:05:00Z', description: 'When the document was uploaded.' })
  uploadedAt: string;
}

export class TravelDocumentListDto {
  /** Documents on the booking, oldest first. */
  data: TravelDocumentDto[];
}

export enum BoardingPassFormat {
  Pdf = 'pdf',
  Png = 'png',
  Json = 'json',
}

export enum BoardingGroup {
  A = 'A',
  B = 'B',
  C = 'C',
}

export class BoardingPassQueryDto {
  @ApiProperty({
    enum: BoardingPassFormat,
    enumName: 'BoardingPassFormat',
    required: false,
    default: BoardingPassFormat.Pdf,
    description: '`pdf` to print, `png` for the barcode image (wallet apps), `json` to render your own.',
  })
  @IsOptional()
  @IsEnum(BoardingPassFormat)
  format?: BoardingPassFormat = BoardingPassFormat.Pdf;

  /**
   * Only this passenger (0-based position on the booking). Omit for everyone.
   * @example 0
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  passenger?: number;
}

export class BoardingPassPassengerDto {
  /**
   * Passenger name.
   * @example "Ada Lovelace"
   */
  name: string;

  @ApiProperty({ type: String, nullable: true, example: '24A', description: 'Seat number; `null` when it is assigned at the gate.' })
  seat: string | null;

  @ApiProperty({ enum: BoardingGroup, enumName: 'BoardingGroup', example: BoardingGroup.A, description: 'Boarding group, called in order.' })
  boardingGroup: BoardingGroup;

  /**
   * Payload of the boarding barcode (IATA BCBP style).
   * @example "M1LOVELACE/ADA EBK7HQ2X KSCPRXOT 2031 102Y024A 0001"
   */
  barcode: string;
}

export class BoardingPassDto {
  /**
   * Booking id.
   * @example "bk_7Hq2xP"
   */
  bookingId: string;

  /**
   * Flight id.
   * @example "flt_2031_proxima"
   */
  flightId: string;

  /**
   * Departure spaceport code.
   * @example "KSC"
   */
  from: string;

  /**
   * Destination name.
   * @example "Proxima b"
   */
  to: string;

  /**
   * Launch pad.
   * @example "Pad 39A"
   */
  gate: string;

  @ApiProperty({ format: 'date-time', example: '2031-04-12T07:15:00Z', description: 'Boarding opens (45 minutes before departure).' })
  boardingAt: string;

  @ApiProperty({ format: 'date-time', example: '2031-04-12T08:00:00Z', description: 'Departure time (UTC).' })
  departsAt: string;

  /** One entry per passenger. */
  passengers: BoardingPassPassengerDto[];
}
