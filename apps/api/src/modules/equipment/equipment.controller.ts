import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireAccess } from "../identity/access-control";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import {
  createEquipmentSchema,
  registerEquipmentUnavailabilitySchema,
  registerEquipmentUsageSchema,
  registerMaintenanceSchema,
  updateEquipmentStatusSchema,
} from "./equipment.contract";
import { EquipmentService } from "./equipment.service";

@ApiTags("equipment")
@RequireAccess("operational")
@ApiHeader({ name: "x-demo-tenant-id", required: true })
@Controller("equipment")
export class EquipmentController {
  constructor(
    @Inject(EquipmentService) private readonly service: EquipmentService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: "Equipamentos, manutenções e usos da empresa.",
  })
  getWorkspace(@CurrentTenant() tenant: TenantContext) {
    return this.service.getForTenant(tenant.tenantId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = createEquipmentSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os dados do equipamento.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.create(tenant.tenantId, parsed.data);
  }

  @Post(":equipmentId/maintenance")
  maintain(
    @CurrentTenant() tenant: TenantContext,
    @Param("equipmentId", new ParseUUIDPipe()) equipmentId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerMaintenanceSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os dados da manutenção.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.registerMaintenance(
      tenant.tenantId,
      equipmentId,
      parsed.data,
    );
  }

  @Post(":equipmentId/usages")
  use(
    @CurrentTenant() tenant: TenantContext,
    @Param("equipmentId", new ParseUUIDPipe()) equipmentId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerEquipmentUsageSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise o uso do equipamento.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.registerUsage(
      tenant.tenantId,
      equipmentId,
      parsed.data,
    );
  }

  @Post(":equipmentId/unavailability")
  registerUnavailability(
    @CurrentTenant() tenant: TenantContext,
    @Param("equipmentId", new ParseUUIDPipe()) equipmentId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerEquipmentUnavailabilitySchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise o período de indisponibilidade.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.registerUnavailability(
      tenant.tenantId,
      equipmentId,
      parsed.data,
    );
  }

  @Put(":equipmentId/status")
  changeStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("equipmentId", new ParseUUIDPipe()) equipmentId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateEquipmentStatusSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Escolha um estado válido.");
    return this.service.updateStatus(
      tenant.tenantId,
      equipmentId,
      parsed.data.status,
    );
  }
}
