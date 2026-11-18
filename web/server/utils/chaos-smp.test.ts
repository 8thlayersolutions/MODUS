import { describe, expect, it } from "vitest";
import { makeStatusRequest, parseStatusResponse, readVarInt, writeVarInt } from "./chaos-smp";

describe("Chaos SMP Java status protocol", () => {
  it("encodes and decodes VarInts", () => {
    for (const value of [0, 1, 127, 128, 255, 25565, 2097151]) {
      const encoded = writeVarInt(value);
      expect(readVarInt(encoded)).toEqual({ value, next: encoded.length });
    }
  });

  it("encodes the status handshake and status request", () => {
    const handshake = makeStatusRequest("chaos.mc.anxietyscout.live", 25565);
    expect(handshake.subarray(-2).equals(Buffer.from([0x01, 0x00]))).toBe(true);
    expect(handshake.includes(Buffer.from("chaos.mc.anxietyscout.live"))).toBe(true);
  });

  it("handles incomplete TCP chunks without treating them as errors", () => {
    const data = Buffer.from(JSON.stringify({
      version: { name: "Forge 1.20.1" },
      players: { online: 2, max: 50 },
    }));
    const packet = Buffer.concat([writeVarInt(0), writeVarInt(data.length), data]);
    const response = Buffer.concat([writeVarInt(packet.length), packet]);
    expect(parseStatusResponse(response.subarray(0, 3))).toBeNull();
    expect(parseStatusResponse(response)).toMatchObject({
      version: { name: "Forge 1.20.1" },
      players: { online: 2, max: 50 },
    });
  });

  it("rejects malformed JSON and unexpected packet types", () => {
    const wrongPacket = Buffer.concat([writeVarInt(2), writeVarInt(1), writeVarInt(0)]);
    expect(() => parseStatusResponse(wrongPacket)).toThrow(/Unexpected/);
    const invalidJson = Buffer.from("not-json");
    const payload = Buffer.concat([writeVarInt(0), writeVarInt(invalidJson.length), invalidJson]);
    expect(() => parseStatusResponse(Buffer.concat([writeVarInt(payload.length), payload]))).toThrow();
  });
});
