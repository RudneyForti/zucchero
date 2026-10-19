import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { RequireAccess } from "../identity/access-control";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import {
  adjustInventorySchema,
  createIngredientCategorySchema,
  registerStockLossSchema,
  registerPurchaseSchema,
} from "./pantry.contract";
import { PantryService } from "./pantry.service";

@ApiTags("pantry")
@RequireAccess("operational")
@ApiHeader({
  name: "x-demo-tenant-id",
  required: true,
  description:
    "Somente desenvolvimento; será substituído pelo token validado do provedor.",
})
@Controller("pantry")
export class PantryController {
  constructor(
    @Inject(PantryService) private readonly pantryService: PantryService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Projeção atual da despensa da empresa." })
  getPantry(@CurrentTenant() tenant: TenantContext) {
    return this.pantryService.getForTenant(tenant.tenantId);
  }

  @Post("categories")
  @ApiCreatedResponse({ description: "Categoria criada para a empresa." })
  createCategory(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const parsed = createIngredientCategorySchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Revise os dados da categoria.");
    return this.pantryService.createCategory(tenant.tenantId, parsed.data);
  }

  @Post("purchases")
  @ApiCreatedResponse({
    description: "Compra, lote e movimento de entrada registrados.",
  })
  @ApiConflictResponse({
    description: "Possível duplicidade encontrada antes da criação.",
  })
  @ApiBadRequestResponse({ description: "Dados de compra inválidos." })
  registerPurchase(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const parsed = registerPurchaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_PURCHASE",
        message: "Revise os dados informados para a compra.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.pantryService.registerPurchase(tenant.tenantId, parsed.data);
  }

  @Post("lots/:lotId/inventory-counts")
  @ApiCreatedResponse({
    description: "Diferença de contagem registrada por movimento imutável.",
  })
  adjustInventory(
    @CurrentTenant() tenant: TenantContext,
    @Param("lotId", new ParseUUIDPipe()) lotId: string,
    @Body() body: unknown,
  ) {
    const parsed = adjustInventorySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_INVENTORY_COUNT",
        message: "Revise a contagem e o motivo da conferência.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.pantryService.adjustInventory(
      tenant.tenantId,
      lotId,
      parsed.data,
    );
  }

  @Post("lots/:lotId/losses")
  @ApiCreatedResponse({
    description: "Perda retirada do lote por movimento imutável.",
  })
  registerLoss(
    @CurrentTenant() tenant: TenantContext,
    @Param("lotId", new ParseUUIDPipe()) lotId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerStockLossSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_STOCK_LOSS",
        message: "Revise a quantidade e o motivo da perda.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.pantryService.registerLoss(tenant.tenantId, lotId, parsed.data);
  }
}
