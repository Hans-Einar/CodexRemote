import { DEFAULT_API_PORT, DEFAULT_VITE_PORT } from "./ports";
import { viteConfig } from "../../vite.config";

describe("port defaults", () => {
  it("reserves a non-default Vite port", () => {
    expect(DEFAULT_VITE_PORT).toBe(5280);
    expect(DEFAULT_VITE_PORT).not.toBe(5173);
  });

  it("uses the reserved Vite port in the config", () => {
    expect(viteConfig.server?.host).toBe("0.0.0.0");
    expect(viteConfig.server?.port).toBe(DEFAULT_VITE_PORT);
    expect(viteConfig.server?.strictPort).toBe(true);
  });

  it("reserves the API port used by the proxy", () => {
    expect(DEFAULT_API_PORT).toBe(3180);
    expect(viteConfig.server?.proxy?.["/api"]).toMatchObject({
      target: `http://127.0.0.1:${DEFAULT_API_PORT}`
    });
  });
});
