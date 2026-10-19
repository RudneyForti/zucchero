import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import type { ProductionService } from "../production/production.service";
import { TodayService } from "./today.service";

describe("TodayService", () => {
  it("preserva o produto final como unidade visual da produção", async () => {
    const view = await new TodayService(
      {
        isConfigured: false,
      } as DatabaseService,
      {} as ProductionService,
    ).getForTenant("11111111-1111-4111-8111-111111111111");

    expect(view.currentTask?.finalProduct).toBe("Bolo da Marina");
    expect(view.currentTask?.title).toBe("Preparar a ganache");
    expect(view.currentTask?.steps.map((step) => step.label)).toEqual([
      "Massa",
      "Ganache",
      "Desenforme",
      "Montagem",
      "Pronto",
    ]);
    expect(view.otherOrders).toHaveLength(3);
  });
});
