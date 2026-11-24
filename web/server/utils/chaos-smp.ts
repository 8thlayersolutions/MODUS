import { connect } from "node:net";
import { resolveSrv } from "node:dns/promises";

export interface ChaosSmpStatus {
  address: string;
  state: "online" | "unreachable";
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  latencyMs: number | null;
  checkedAt: string;
}
const MAX_RESPONSE_BYTES = 64 * 1024;
let cached: { key: string; at: number; result: ChaosSmpStatus } | null = null;
let pending: Promise<ChaosSmpStatus> | null = null;

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let n = value >>> 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    bytes.push(b);
  } while (n !== 0);
  return Buffer.from(bytes);
}
export function readVarInt(data: Buffer, offset = 0): { value: number; next: number } | null {
  let result = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= data.length) return null;
    const byte = data[offset + i]!;
    result |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return { value: result >>> 0, next: offset + i + 1 };
  }
  throw new Error("Minecraft packet has malformed VarInt");
}
export function makeStatusRequest(host: string, port: number): Buffer {
  const address = Buffer.from(host, "utf8");
  if (address.length < 1 || address.length > 255) throw new Error("Invalid Minecraft address");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Minecraft port");
  const portBytes = Buffer.allocUnsafe(2);
  portBytes.writeUInt16BE(port);
  const handshake = Buffer.concat([
    writeVarInt(0),
    writeVarInt(0),
    writeVarInt(address.length),
    address,
    portBytes,
    writeVarInt(1),
  ]);
  return Buffer.concat([writeVarInt(handshake.length), handshake, Buffer.from([0x01, 0x00])]);
}
export function parseStatusResponse(data: Buffer): Record<string, unknown> | null {
  const packet = readVarInt(data, 0);
  if (!packet) return null;
  if (packet.value > MAX_RESPONSE_BYTES) throw new Error("Minecraft response too large");
  if (data.length < packet.next + packet.value) return null;
  const id = readVarInt(data, packet.next);
  if (!id || id.value !== 0) throw new Error("Unexpected Minecraft status packet");
  const jsonLength = readVarInt(data, id.next);
  if (!jsonLength || jsonLength.value > MAX_RESPONSE_BYTES) throw new Error("Invalid status length");
  if (jsonLength.next + jsonLength.value > packet.next + packet.value) {
    throw new Error("Malformed Minecraft response");
  }
  const value = JSON.parse(data.subarray(jsonLength.next, jsonLength.next + jsonLength.value).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed Minecraft JSON");
  return value as Record<string, unknown>;
}
async function resolveServer(host: string, port: number): Promise<{ host: string; port: number }> {
  if (port !== 25565) return { host, port };
  try {
    const records = await Promise.race([
      resolveSrv("_minecraft._tcp." + host),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SRV timeout")), 800)),
    ]);
    const first = [...records].sort((a, b) => a.priority - b.priority)[0];
    if (first?.name && Number.isInteger(first.port) && first.port > 0 && first.port <= 65535) {
      return { host: first.name.replace(/\.$/, ""), port: first.port };
    }
  } catch { /* No SRV record or DNS unavailable. */ }
  return { host, port };
}
async function probeJavaStatus(host: string, port: number): Promise<{ json: Record<string, unknown>; latencyMs: number }> {
  const destination = await resolveServer(host, port);
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const socket = connect(destination.port, destination.host);
    let received = Buffer.alloc(0);
    let settled = false;
    const done = (error: Error | null, json?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error || !json) reject(error ?? new Error("No Minecraft status data"));
      else resolve({ json, latencyMs: Date.now() - start });
    };
    socket.setTimeout(2500);
    socket.once("connect", () => {
      try { socket.write(makeStatusRequest(host, destination.port)); }
      catch (e) { done(e instanceof Error ? e : new Error("Invalid status request")); }
    });
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      if (received.length > MAX_RESPONSE_BYTES + 10) {
        done(new Error("Minecraft response exceeded size limit"));
        return;
      }
      try {
        const json = parseStatusResponse(received);
        if (json) done(null, json);
      } catch (e) { done(e instanceof Error ? e : new Error("Invalid Minecraft response")); }
    });
    socket.once("error", (e) => done(e));
    socket.once("timeout", () => done(new Error("Minecraft status timeout")));
    socket.once("end", () => done(new Error("Minecraft server closed without status")));
  });
}
function limitText(value: unknown, max = 90): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}
export async function getChaosSmpStatus(host: string, port: number, address: string): Promise<ChaosSmpStatus> {
  const key = host + ":" + port + ":" + address;
  if (cached?.key === key && Date.now() - cached.at < 20_000) return cached.result;
  if (pending) return pending;
  pending = (async () => {
    let result: ChaosSmpStatus = {
      address, state: "unreachable", playersOnline: null, playersMax: null,
      version: null, latencyMs: null, checkedAt: new Date().toISOString(),
    };
    try {
      const { json, latencyMs } = await probeJavaStatus(host, port);
      const players = json.players && typeof json.players === "object"
        ? json.players as Record<string, unknown> : {};
      const version = json.version && typeof json.version === "object"
        ? json.version as Record<string, unknown> : {};
      result = {
        ...result, state: "online",
        playersOnline: Number.isInteger(players.online) ? Number(players.online) : null,
        playersMax: Number.isInteger(players.max) ? Number(players.max) : null,
        version: limitText(version.name), latencyMs, checkedAt: new Date().toISOString(),
      };
    } catch { /* A failed probe cannot prove the server is offline. */ }
    cached = { key, at: Date.now(), result };
    return result;
  })();
  try { return await pending; } finally { pending = null; }
}
