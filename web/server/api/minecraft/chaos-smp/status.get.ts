import { getChaosSmpStatus } from "../../../utils/chaos-smp";

/** Public, read-only Minecraft Java status. No player names or private data. */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const host = String(config.chaosSmpHost || "chaos.mc.anxietyscout.live");
  const parsedPort = Number(config.chaosSmpPort || "25565");
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort : 25565;
  setHeader(event, "Cache-Control", "public, max-age=15");
  return getChaosSmpStatus(host, port, "chaos.mc.anxietyscout.live");
});
