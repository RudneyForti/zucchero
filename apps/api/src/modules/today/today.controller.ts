import { Controller, Get, Inject } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireAccess } from "../identity/access-control";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import { TodayService } from "./today.service";

@ApiTags("today")
@RequireAccess("operational")
@Controller("today")
export class TodayController {
  constructor(
    @Inject(TodayService) private readonly todayService: TodayService,
  ) {}

  @Get()
  @ApiHeader({
    name: "x-demo-tenant-id",
    required: true,
    description:
      "Somente desenvolvimento; será substituído pelo token validado do provedor.",
  })
  @ApiOkResponse({
    description: "Projeção da bancada para a empresa autenticada.",
  })
  getToday(@CurrentTenant() tenant: TenantContext) {
    return this.todayService.getForTenant(tenant.tenantId);
  }
}
