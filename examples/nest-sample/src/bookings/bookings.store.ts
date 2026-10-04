import { CabinClass } from '../flights/flight.dto';
import { BookingDto, BookingStatus, DocumentKind, DocumentStatus, TravelDocumentDto } from './booking.dto';

/** In-memory bookings, newest first. Seeded with the bookings the docs' examples use (the second is unpaid). */
export const BOOKINGS: BookingDto[] = [
  {
    id: 'bk_7Hq2xP',
    status: BookingStatus.Confirmed,
    flightId: 'flt_2031_proxima',
    cabin: CabinClass.Economy,
    passengers: [{ name: 'Ada Lovelace', email: 'ada@example.com' }],
    totalAmount: 1299900,
    currency: 'USD',
    reference: 'order-8812',
    documents: ['passport-ada.pdf'],
    seats: ['22A'],
    createdAt: '2026-10-03T12:00:00Z',
  },
  {
    id: 'bk_9Rz4Wt',
    status: BookingStatus.Confirmed,
    flightId: 'flt_2032_trappist',
    cabin: CabinClass.Cryosleep,
    passengers: [{ name: 'Grace Hopper', email: 'grace@example.com' }],
    totalAmount: 8999900,
    currency: 'USD',
    reference: 'order-8813',
    documents: [],
    seats: [],
    createdAt: '2026-10-02T09:30:00Z',
  },
];

/** Uploaded travel documents, by booking id. */
export const DOCUMENTS = new Map<string, TravelDocumentDto[]>([
  [
    'bk_7Hq2xP',
    [
      {
        id: 'doc_Pz71aQ',
        kind: DocumentKind.Passport,
        fileName: 'passport-ada.pdf',
        contentType: 'application/pdf',
        sizeBytes: 482113,
        status: DocumentStatus.Verified,
        rejectionReason: null,
        uploadedAt: '2026-10-03T12:05:00Z',
      },
    ],
  ],
]);
