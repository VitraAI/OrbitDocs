import { crc32, deflateSync } from 'node:zlib';

import { BoardingPassDto } from './booking.dto';

/** A one-page PDF per passenger, Helvetica text only (no dependencies). */
export function boardingPassPdf(pass: BoardingPassDto): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const pages = pass.passengers.map((p) => {
    const lines: Array<[number, number, number, string]> = [
      [24, 40, 760, 'ORBIT TRAVEL  -  BOARDING PASS'],
      [14, 40, 720, `Passenger: ${p.name}`],
      [14, 40, 696, `Flight: ${pass.flightId}   ${pass.from} -> ${pass.to}`],
      [14, 40, 672, `Seat: ${p.seat ?? 'assigned at the gate'}   Group: ${p.boardingGroup}   Gate: ${pass.gate}`],
      [14, 40, 648, `Boarding: ${pass.boardingAt}   Departs: ${pass.departsAt}`],
      [10, 40, 610, `Booking ${pass.bookingId}   ${p.barcode}`],
    ];
    return lines.map(([size, x, y, text]) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`).join('\n');
  });

  // Objects: 1 catalog, 2 pages, 3 font, then a page + content stream per passenger.
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((content, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A PNG of the first passenger's barcode: bars drawn from the payload's bits. */
export function boardingPassPng(pass: BoardingPassDto): Buffer {
  const width = 480;
  const height = 160;
  const bits = [...Buffer.from(pass.passengers[0]?.barcode ?? pass.bookingId)].flatMap((byte) => [...byte.toString(2).padStart(8, '0')].map(Number));
  const barWidth = Math.max(1, Math.floor((width - 40) / bits.length));
  const raw = Buffer.alloc((width * 3 + 1) * height, 0xff);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = Math.floor((x - 20) / barWidth);
      const header = y < 24;
      const bar = !header && y > 40 && y < height - 20 && x >= 20 && i < bits.length && bits[i] === 1;
      const [r, g, b] = header ? [17, 24, 39] : bar ? [0, 0, 0] : [255, 255, 255];
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
