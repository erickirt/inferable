import { buildRequest, client } from "../utils";
import { productService } from "./product";

describe("retrying", () => {
  const service = productService();

  beforeAll(async () => {
    await service.start();
  });

  afterAll(async () => {
    await service.stop();
  });

  it("should not retry a function when attempts is 1", async () => {
    const productId = Math.random().toString();

    const result = await client.executeJobSync(
      buildRequest({
        service: service.definition.name,
        function: "failingFunction",
        input: { id: productId },
      }),
    );

    expect(result.status).toBe(500);
  });

  it("should be able to retry a function", async () => {
    const productId = Math.random().toString();

    const result = await client.executeJobSync(
      buildRequest({
        service: service.definition.name,
        function: "succeedsOnSecondAttempt",
        input: { id: productId },
      }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("resultType", "resolution");
  }, 30_000);
});
