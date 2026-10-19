import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/despensa/actions", () => ({
  createCategoryAction: vi.fn(),
  fiscalImportAction: vi.fn(),
  mutateStockAction: vi.fn(),
  registerPurchaseAction: vi.fn(),
}));

import { PantryDashboard } from "@/components/pantry-dashboard";
import { demoPantry, type PantryView } from "@/lib/pantry";

const groupedPantry: PantryView = {
  ...demoPantry,
  categories: demoPantry.categories.map((category) =>
    category.name === "Chocolates e cacaus"
      ? { ...category, groupCount: 2 }
      : category,
  ),
  groups: [
    ...demoPantry.groups,
    {
      id: "34444444-4444-4444-8444-444444444444",
      name: "Cacau em pó",
      categoryId: "21111111-1111-4111-8111-111111111111",
      category: "Chocolates e cacaus",
      baseUnit: "g",
      minimumStock: 500,
      availableBase: 0,
      availableLabel: "0 g",
      status: "low",
      items: [],
    },
  ],
};

describe("PantryDashboard", () => {
  it("renders one main surface per category and ingredients as nested rows", () => {
    const markup = renderToStaticMarkup(
      <PantryDashboard initialPantry={groupedPantry} />,
    );

    expect(markup.match(/class="pantry-category-card"/g)).toHaveLength(3);
    expect(markup.match(/<details class="pantry-ingredient"/g)).toHaveLength(4);
    expect(markup).toContain("2 ingredientes");
    expect(markup).toContain("Cacau em pó");
  });
});
