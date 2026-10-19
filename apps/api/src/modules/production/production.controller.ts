import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireAccess } from "../identity/access-control";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import {
  productionConsumptionCorrectionSchema,
  productionConsumptionSchema,
  productionNoteSchema,
  productionTaskActionSchema,
} from "./production.contract";
import { ProductionService } from "./production.service";

@ApiTags("production")
@RequireAccess("operational")
@Controller("production")
export class ProductionController {
  constructor(
    @Inject(ProductionService)
    private readonly productionService: ProductionService,
  ) {}

  @Put("tasks/:taskId")
  @ApiHeader({ name: "x-demo-tenant-id", required: true })
  @ApiOkResponse({ description: "Tarefa atualizada e próxima ação liberada." })
  updateTask(
    @CurrentTenant() tenant: TenantContext,
    @Param("taskId", new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    const parsed = productionTaskActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_PRODUCTION_ACTION",
        message: "Revise o próximo passo do preparo.",
      });
    }
    return this.productionService.updateTask(
      tenant.tenantId,
      taskId,
      parsed.data,
    );
  }

  @Put("tasks/:taskId/consumption/corrections")
  @ApiHeader({ name: "x-demo-tenant-id", required: true })
  @ApiOkResponse({
    description: "Correção compensatória do consumo registrada.",
  })
  correctConsumption(
    @CurrentTenant() tenant: TenantContext,
    @Param("taskId", new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    const parsed = productionConsumptionCorrectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_PRODUCTION_CONSUMPTION_CORRECTION",
        message: "Revise os novos valores e conte o motivo da correção.",
      });
    }
    return this.productionService.correctConsumption(
      tenant.tenantId,
      taskId,
      parsed.data,
    );
  }

  @Put("tasks/:taskId/consumption")
  @ApiHeader({ name: "x-demo-tenant-id", required: true })
  @ApiOkResponse({ description: "Consumo real da tarefa confirmado." })
  confirmConsumption(
    @CurrentTenant() tenant: TenantContext,
    @Param("taskId", new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    const parsed = productionConsumptionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_PRODUCTION_CONSUMPTION",
        message: "Revise as quantidades usadas e as perdas desta etapa.",
      });
    }
    return this.productionService.confirmConsumption(
      tenant.tenantId,
      taskId,
      parsed.data,
    );
  }

  @Put("tasks/:taskId/note")
  @ApiHeader({ name: "x-demo-tenant-id", required: true })
  @ApiOkResponse({ description: "Observação do preparo preservada." })
  saveNote(
    @CurrentTenant() tenant: TenantContext,
    @Param("taskId", new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    const parsed = productionNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_PRODUCTION_NOTE",
        message: "A observação deve ter entre 1 e 1.000 caracteres.",
      });
    }
    return this.productionService.saveNote(
      tenant.tenantId,
      taskId,
      parsed.data.note,
    );
  }
}
