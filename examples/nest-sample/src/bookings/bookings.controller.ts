import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiExtraModels, ApiHeader, ApiParam, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { DocsContent, DocsErrors, DocsOperation, DocsSamples } from '@orbitdocs/nestjs';

import { Authenticated } from '../common/auth';
import { newId } from '../common/id';
import { PageQueryDto, paginate } from '../common/pagination.dto';
import { RateLimited } from '../common/rate-limit';
import { DESTINATIONS } from '../destinations/destinations.controller';
import { FLIGHTS } from '../flights/flights.controller';
import { SeatHoldStatus, SeatStatus } from '../seats/seat.dto';
import { activeHold, findSeat } from '../seats/seat-map';
import { WebhooksService } from '../webhooks/webhooks.service';
import { boardingPassPdf, boardingPassPng } from './boarding-pass';
import {
  BoardingGroup,
  BoardingPassDto,
  BoardingPassFormat,
  BoardingPassQueryDto,
  BookingDto,
  BookingListDto,
  BookingStatus,
  CancelBookingDto,
  CreateBookingDto,
  DocumentKind,
  DocumentStatus,
  TravelDocumentListDto,
  UpdateBookingDto,
  UploadDocumentDto,
} from './booking.dto';
import { BOOKINGS, DOCUMENTS } from './bookings.store';

const IDEMPOTENCY = new Map<string, string>();

const idParam = ApiParam({ name: 'id', description: 'Booking id.', example: 'bk_7Hq2xP' });

@Controller({ path: 'bookings', version: '1' })
@Authenticated()
@RateLimited()
@ApiExtraModels(BoardingPassDto)
export class BookingsController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Books seats on a flight for one or more passengers. The booking is
   * confirmed immediately when seats are available; a `booking.confirmed`
   * webhook follows.
   *
   * Send an `Idempotency-Key` so a retried request never books twice.
   */
  @Post()
  @DocsOperation({ group: 'Bookings', title: 'Create a booking', order: 1 })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Unique key per booking attempt; retries with the same key return the first result.', example: 'a3f1c2d4-booking-8812' })
  @DocsErrors({ 404: 'No flight with this id.', 409: 'Not enough seats left in this cabin.' })
  @DocsSamples([
    {
      lang: 'typescript',
      label: 'TypeScript SDK',
      source: "const booking = await orbit.bookings.create({\n  flightId: 'flt_2031_proxima',\n  cabin: 'economy',\n  passengers: [{ name: 'Ada Lovelace', email: 'ada@example.com' }],\n});",
    },
  ])
  create(@Body() dto: CreateBookingDto, @Headers('idempotency-key') key?: string): BookingDto {
    const previous = key && IDEMPOTENCY.get(key);
    if (previous) return BOOKINGS.find((b) => b.id === previous)!;
    const flight = FLIGHTS.find((f) => f.id === dto.flightId);
    if (!flight) throw new NotFoundException(`Flight ${dto.flightId} not found`);
    const fare = flight.fares.find((f) => f.cabin === dto.cabin);
    if (!fare || fare.seatsLeft < dto.passengers.length) throw new ConflictException('Not enough seats left in this cabin');
    fare.seatsLeft -= dto.passengers.length;
    const booking: BookingDto = {
      id: newId('bk'),
      status: BookingStatus.Confirmed,
      flightId: dto.flightId,
      cabin: dto.cabin,
      passengers: dto.passengers,
      totalAmount: fare.amount * dto.passengers.length,
      currency: fare.currency,
      reference: dto.reference,
      documents: [],
      seats: [],
      createdAt: new Date().toISOString(),
    };
    BOOKINGS.unshift(booking);
    if (key) IDEMPOTENCY.set(key, booking.id);
    this.webhooks.emit('booking.confirmed', booking);
    return booking;
  }

  /**
   * Lists your bookings, newest first.
   */
  @Get()
  @DocsOperation({ group: 'Bookings', title: 'List bookings', order: 2 })
  list(@Query() query: PageQueryDto): BookingListDto {
    return paginate(BOOKINGS, query);
  }

  /**
   * Returns one booking.
   *
   * > [!TIP]
   * > Store the booking \`id\` you get from Create a booking; it is the only way to fetch it later.
   */
  @Get(':id')
  @DocsOperation({ group: 'Bookings', title: 'Get a booking', order: 3 })
  @DocsErrors({ 404: 'No booking with this id.' })
  @idParam
  get(@Param('id') id: string): BookingDto {
    return this.find(id);
  }

  /**
   * Changes a booking: correct passenger details, choose seats or change
   * your reference. Send only what changes. Seats come one per passenger, in
   * passenger order; assign held seats by sending the hold's `holdId`. A
   * `booking.changed` webhook follows, with the previous values.
   */
  @Patch(':id')
  @DocsOperation({ group: 'Bookings', title: 'Update a booking', order: 4 })
  @DocsErrors({
    404: 'No booking with this id, or no active hold with `holdId`.',
    409: 'The booking is cancelled, or a seat is taken.',
    422: 'The number of passengers or seats does not match the booking, or a seat is in another cabin.',
  })
  @idParam
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto): BookingDto {
    const booking = this.find(id);
    if (booking.status === BookingStatus.Cancelled) throw new ConflictException('A cancelled booking cannot change');
    const count = booking.passengers.length;
    if (dto.passengers && dto.passengers.length !== count) {
      throw new UnprocessableEntityException(`The booking has ${count} passengers; cancel and book again to change that`);
    }
    const previous: Record<string, unknown> = {};
    if (dto.seats) {
      if (dto.seats.length !== count) throw new UnprocessableEntityException(`Send ${count} seat${count === 1 ? '' : 's'}, one per passenger`);
      const flight = FLIGHTS.find((f) => f.id === booking.flightId)!;
      const hold = dto.holdId ? activeHold(flight.id, dto.holdId) : undefined;
      if (dto.holdId && !hold) throw new NotFoundException(`No active seat hold ${dto.holdId} on flight ${flight.id}`);
      for (const number of dto.seats) {
        const match = findSeat(flight, number);
        if (!match) throw new UnprocessableEntityException(`Seat ${number} does not exist on flight ${flight.id}`);
        if (match.cabin !== booking.cabin) throw new UnprocessableEntityException(`Seat ${number} is not in ${booking.cabin}`);
        const ours = booking.seats.includes(number) || hold?.seats.includes(number);
        if (!ours && match.seat.status !== SeatStatus.Available) throw new ConflictException(`Seat ${number} is ${match.seat.status}`);
      }
      if (hold) hold.status = SeatHoldStatus.Used;
      previous.seats = booking.seats;
      booking.seats = dto.seats;
    }
    if (dto.passengers) {
      previous.passengers = booking.passengers;
      booking.passengers = dto.passengers;
    }
    if (dto.reference !== undefined) {
      previous.reference = booking.reference ?? null;
      booking.reference = dto.reference ?? undefined;
    }
    if (Object.keys(previous).length) this.webhooks.emit('booking.changed', booking, previous);
    return booking;
  }

  /**
   * Cancels a booking and releases its seats. Cancelling twice is a no-op.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  @DocsOperation({ group: 'Bookings', title: 'Cancel a booking', order: 5 })
  @DocsContent('> [!WARNING]\n> Cancelling less than 24 hours before departure is not refunded.')
  @DocsErrors({ 404: 'No booking with this id.' })
  @idParam
  cancel(@Param('id') id: string, @Body() _dto: CancelBookingDto): BookingDto {
    const booking = this.find(id);
    if (booking.status !== BookingStatus.Cancelled) {
      booking.status = BookingStatus.Cancelled;
      this.webhooks.emit('booking.cancelled', booking);
    }
    return booking;
  }

  /**
   * Attaches a travel document (passport or visa scan) to a booking.
   */
  @Post(':id/documents')
  @DocsOperation({ group: 'Bookings', title: 'Upload a travel document', order: 6, stability: 'beta' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDocumentDto })
  @DocsErrors({ 404: 'No booking with this id.' })
  @idParam
  upload(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File): BookingDto {
    const booking = this.find(id);
    const fileName = file?.originalname ?? 'document';
    booking.documents.push(fileName);
    const kind = /visa/i.test(fileName) ? DocumentKind.Visa : /passport/i.test(fileName) ? DocumentKind.Passport : DocumentKind.Other;
    const docs = DOCUMENTS.get(id) ?? [];
    docs.push({
      id: newId('doc'),
      kind,
      fileName,
      contentType: file?.mimetype ?? 'application/pdf',
      sizeBytes: file?.size ?? 0,
      status: DocumentStatus.PendingReview,
      rejectionReason: null,
      uploadedAt: new Date().toISOString(),
    });
    DOCUMENTS.set(id, docs);
    return booking;
  }

  /**
   * Lists the travel documents uploaded to a booking, with their review
   * status. Passports are usually verified within an hour.
   */
  @Get(':id/documents')
  @DocsOperation({ group: 'Bookings', title: 'List travel documents', order: 7 })
  @DocsErrors({ 404: 'No booking with this id.' })
  @idParam
  documents(@Param('id') id: string): TravelDocumentListDto {
    this.find(id);
    return { data: DOCUMENTS.get(id) ?? [] };
  }

  /**
   * Downloads the boarding pass of a confirmed booking: a printable PDF
   * (default), a PNG of the barcode for wallet apps (`format=png`), or the
   * data as JSON to render your own (`format=json`).
   */
  @Get(':id/boarding-pass')
  @DocsOperation({ group: 'Bookings', title: 'Download a boarding pass', order: 8 })
  @ApiResponse({
    status: 200,
    description: 'The boarding pass, in the format asked for.',
    headers: {
      'Content-Disposition': { description: 'File name to save as (PDF and PNG).', schema: { type: 'string', example: 'attachment; filename="boarding-pass-bk_7Hq2xP.pdf"' } },
    },
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary', description: 'One page per passenger.' } },
      'image/png': { schema: { type: 'string', format: 'binary', description: 'Barcode of the first passenger (or of `passenger`).' } },
      'application/json': { schema: { $ref: getSchemaPath(BoardingPassDto) } },
    },
  })
  @DocsErrors({ 404: 'No booking with this id, or no such passenger.', 409: 'The booking is cancelled.' })
  @idParam
  boardingPass(@Param('id') id: string, @Query() query: BoardingPassQueryDto): StreamableFile | BoardingPassDto {
    const booking = this.find(id);
    if (booking.status === BookingStatus.Cancelled) throw new ConflictException('The booking is cancelled');
    const flight = FLIGHTS.find((f) => f.id === booking.flightId)!;
    const destination = DESTINATIONS.find((d) => d.id === flight.destinationId);
    const all = booking.passengers.map((p, i) => ({ ...p, index: i }));
    const chosen = query.passenger === undefined ? all : all.filter((p) => p.index === query.passenger);
    if (!chosen.length) throw new NotFoundException(`Booking ${id} has no passenger ${query.passenger}`);
    const pass: BoardingPassDto = {
      bookingId: booking.id,
      flightId: flight.id,
      from: flight.from,
      to: destination?.name ?? flight.destinationId,
      gate: 'Pad 39A',
      boardingAt: new Date(Date.parse(flight.departsAt) - 45 * 60_000).toISOString(),
      departsAt: flight.departsAt,
      passengers: chosen.map((p) => {
        const seat = booking.seats[p.index] ?? null;
        const [first = '', ...rest] = p.name.split(' ');
        const to = (destination?.name ?? flight.destinationId).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
        const code = `M1${rest.join(' ').toUpperCase()}/${first.toUpperCase()} E${booking.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase()} ${flight.from}${to}OT ${seat ?? 'GATE'}`;
        const boardingGroup = seat && /[AF]$/.test(seat) ? BoardingGroup.A : seat ? BoardingGroup.B : BoardingGroup.C;
        return { name: p.name, seat, boardingGroup, barcode: code };
      }),
    };
    const format = query.format ?? BoardingPassFormat.Pdf;
    if (format === BoardingPassFormat.Json) return pass;
    const file = format === BoardingPassFormat.Png ? boardingPassPng(pass) : boardingPassPdf(pass);
    return new StreamableFile(file, {
      type: format === BoardingPassFormat.Png ? 'image/png' : 'application/pdf',
      disposition: `${format === BoardingPassFormat.Png ? 'inline' : 'attachment'}; filename="boarding-pass-${booking.id}.${format}"`,
    });
  }

  private find(id: string): BookingDto {
    const booking = BOOKINGS.find((b) => b.id === id);
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }
}
