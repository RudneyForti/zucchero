import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import { RequireAccess } from "../identity/access-control";
import {
  confirmMfaSchema,
  deleteOwnAccountSchema,
  disableMfaSchema,
  inviteMemberSchema,
  updateMemberAccessSchema,
  updateBusinessHoursSchema,
  updateCompanySchema,
  updateProfileSchema,
  updateSalesPresetsSchema,
} from "./settings.contract";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiHeader({ name: "x-demo-tenant-id", required: true })
@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly service: SettingsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Identidade e combinados da confeitaria." })
  getWorkspace(@CurrentTenant() tenant: TenantContext) {
    return this.service.getForTenant(tenant);
  }

  @Patch("company")
  @RequireAccess("owner")
  updateCompany(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = updateCompanySchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os dados da confeitaria.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.updateCompany(tenant.tenantId, parsed.data);
  }

  @Patch("sales")
  @RequireAccess("owner")
  updateSales(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = updateSalesPresetsSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os combinados de venda.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.updateSales(tenant.tenantId, parsed.data);
  }

  @Patch("profile")
  updateProfile(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Revise seu nome e escolha uma imagem PNG, JPG ou WebP de até 512 KB.",
      );
    }
    return this.service.updateProfile(tenant, parsed.data);
  }

  @Post("profile/mfa/setup")
  setupMfa(@CurrentTenant() tenant: TenantContext) {
    return this.service.setupMfa(tenant);
  }

  @Post("profile/mfa/confirm")
  confirmMfa(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = confirmMfaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Digite os 6 números do Authenticator.");
    }
    return this.service.confirmMfa(tenant, parsed.data);
  }

  @Delete("profile/mfa")
  disableMfa(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = disableMfaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Confirme sua senha e os 6 números do Authenticator.",
      );
    }
    return this.service.disableMfa(tenant, parsed.data);
  }

  @Patch("schedule")
  @RequireAccess("owner")
  updateSchedule(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const parsed = updateBusinessHoursSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os horários da cozinha.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.updateBusinessHours(tenant.tenantId, parsed.data);
  }

  @Post("people/invitations")
  @RequireAccess("owner")
  invite(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? "Revise o convite.",
      );
    }
    return this.service.inviteMember(tenant, parsed.data);
  }

  @Delete("people/invitations/:invitationId")
  @RequireAccess("owner")
  revokeInvitation(
    @CurrentTenant() tenant: TenantContext,
    @Param("invitationId", new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.service.revokeInvitation(tenant, invitationId);
  }

  @Put("people/:userId/access")
  @RequireAccess("owner")
  updateAccess(
    @CurrentTenant() tenant: TenantContext,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateMemberAccessSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? "Revise os grupos de acesso.",
      );
    }
    return this.service.updateMemberAccess(tenant, userId, parsed.data);
  }

  @Delete("people/:userId")
  @RequireAccess("owner")
  removeMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.service.removeMember(tenant, userId);
  }

  @Delete("profile")
  deleteOwnAccount(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: unknown,
  ) {
    const parsed = deleteOwnAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Confirme a decisão, o nome da confeitaria e sua senha.",
      );
    }
    return this.service.deleteOwnAccount(tenant, parsed.data);
  }
}
