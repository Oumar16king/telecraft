// Minimal ZIP writer (stored entries, no compression) — works in the Worker runtime.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(view: number[], value: number) {
  view.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeUint16(view: number[], value: number) {
  view.push(value & 0xff, (value >>> 8) & 0xff);
}

export function createZip(entries: { path: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ""));
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    const header: number[] = [];
    writeUint32(header, 0x04034b50);
    writeUint16(header, 20);
    writeUint16(header, 0x0800); // UTF-8 names
    writeUint16(header, 0); // stored
    writeUint16(header, 0);
    writeUint16(header, 0);
    writeUint32(header, crc);
    writeUint32(header, data.length);
    writeUint32(header, data.length);
    writeUint16(header, nameBytes.length);
    writeUint16(header, 0);
    local.push(...header, ...nameBytes, ...data);

    const directory: number[] = [];
    writeUint32(directory, 0x02014b50);
    writeUint16(directory, 20);
    writeUint16(directory, 20);
    writeUint16(directory, 0x0800);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint32(directory, crc);
    writeUint32(directory, data.length);
    writeUint32(directory, data.length);
    writeUint16(directory, nameBytes.length);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint16(directory, 0);
    writeUint32(directory, 0);
    writeUint32(directory, offset);
    central.push(...directory, ...nameBytes);

    offset += header.length + nameBytes.length + data.length;
  }

  const end: number[] = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, entries.length);
  writeUint16(end, entries.length);
  writeUint32(end, central.length);
  writeUint32(end, offset);
  writeUint16(end, 0);

  return new Uint8Array([...local, ...central, ...end]);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
