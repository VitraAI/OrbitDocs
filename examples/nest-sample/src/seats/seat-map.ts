import { BookingStatus } from '../bookings/booking.dto';
import { BOOKINGS } from '../bookings/bookings.store';
import { CabinClass, FlightDto } from '../flights/flight.dto';
import { CabinSeatMapDto, SeatDto, SeatFeature, SeatHoldDto, SeatHoldStatus, SeatStatus } from './seat.dto';

export const HOLD_SECONDS = 900;

/** Seat holds, newest first. */
export const SEAT_HOLDS: SeatHoldDto[] = [];

/** Rows and columns per cabin ('' = aisle), and the exit row. */
const LAYOUTS: Record<CabinClass, { rows: [number, number]; layout: string[]; exitRow?: number }> = {
  [CabinClass.Business]: { rows: [1, 4], layout: ['A', 'C', '', 'D', 'F'] },
  [CabinClass.Cryosleep]: { rows: [5, 8], layout: ['A', 'B', '', 'C', 'D'] },
  [CabinClass.Economy]: { rows: [20, 27], layout: ['A', 'B', 'C', '', 'D', 'E', 'F'], exitRow: 24 },
};

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Expires holds whose time is up. */
function activeHolds(flightId: string): SeatHoldDto[] {
  const now = new Date().toISOString();
  for (const hold of SEAT_HOLDS) if (hold.status === SeatHoldStatus.Active && hold.expiresAt <= now) hold.status = SeatHoldStatus.Expired;
  return SEAT_HOLDS.filter((h) => h.flightId === flightId && h.status === SeatHoldStatus.Active);
}

/** Seats taken by bookings on this flight, by seat number → booking id. */
function bookedSeats(flightId: string): Map<string, string> {
  const taken = new Map<string, string>();
  for (const b of BOOKINGS) if (b.flightId === flightId && b.status !== BookingStatus.Cancelled) for (const s of b.seats) taken.set(s, b.id);
  return taken;
}

export function cabinMaps(flight: FlightDto): CabinSeatMapDto[] {
  const booked = bookedSeats(flight.id);
  const held = new Set(activeHolds(flight.id).flatMap((h) => h.seats));
  return flight.fares.map(({ cabin }) => {
    const { rows, layout, exitRow } = LAYOUTS[cabin];
    const columns = layout.filter(Boolean);
    const out: CabinSeatMapDto = { cabin, layout, rows: [] };
    for (let row = rows[0]; row <= rows[1]; row++) {
      const seats: SeatDto[] = columns.map((column) => {
        const number = `${row}${column}`;
        const i = layout.indexOf(column);
        const features: SeatFeature[] = [];
        if (i === 0 || i === layout.length - 1) features.push(cabin === CabinClass.Cryosleep ? SeatFeature.Viewport : SeatFeature.Window);
        if (layout[i - 1] === '' || layout[i + 1] === '') features.push(SeatFeature.Aisle);
        if (row === exitRow) features.push(SeatFeature.ExitRow, SeatFeature.ExtraLegroom);
        // Other customers' seats: a stable pseudo-random spread, never the exit row.
        const sold = row !== exitRow && hash(flight.id + number) % 4 === 0;
        const status = booked.has(number) || sold ? SeatStatus.Occupied : held.has(number) ? SeatStatus.Held : hash(number) % 23 === 0 ? SeatStatus.Blocked : SeatStatus.Available;
        const price = row === exitRow ? { amount: 4900, currency: 'USD' } : null;
        return { number, column, status, features, price };
      });
      out.rows.push({ number: row, seats });
    }
    return out;
  });
}

/** The seat on this flight, with its cabin, or undefined when the flight has no such seat. */
export function findSeat(flight: FlightDto, number: string): { cabin: CabinClass; seat: SeatDto } | undefined {
  for (const map of cabinMaps(flight)) {
    for (const row of map.rows) {
      const seat = row.seats.find((s) => s.number === number);
      if (seat) return { cabin: map.cabin, seat };
    }
  }
  return undefined;
}

/** Active hold by id. */
export function activeHold(flightId: string, id: string): SeatHoldDto | undefined {
  return activeHolds(flightId).find((h) => h.id === id);
}
