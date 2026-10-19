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
  anonymizeCustomerSchema,
  saveCustomerSchema,
} from "./customers.contract";
import { CustomersService } from "./customers.service";

@ApiTags("customers")
@RequireAccess("operational")
@ApiHeader({
  name: "x-demo-tenant-id",
  required: true,
  description:
    "Somente desenvolvimento; será substituído pela identidade validada.",
})
@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(CustomersService)
    private readonly customersService: CustomersService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Clientes e endereços ativos da empresa." })
  getCustomers(@CurrentTenant() tenant: TenantContext) {
    return this.customersService.getForTenant(tenant.tenantId);
  }

  @Post()
  @ApiCreatedResponse({ description: "Cliente criado para a empresa." })
  @ApiConflictResponse({ description: "Telefone já pertence a outro cliente." })
  @ApiBadRequestResponse({ description: "Dados do cliente inválidos." })
  create(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const input = this.parse(body);
    return this.customersService.create(tenant.tenantId, input);
  }

  @Put(":customerId")
  @ApiOkResponse({ description: "Cadastro do cliente atualizado." })
  @ApiConflictResponse({ description: "Telefone já pertence a outro cliente." })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
    @Body() body: unknown,
  ) {
    const input = this.parse(body);
    return this.customersService.update(tenant.tenantId, customerId, input);
  }

  @Post(":customerId/privacy/export")
  @ApiOkResponse({ description: "Dados da cliente exportados e auditados." })
  exportPrivacyData(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
  ) {
    return this.customersService.exportPrivacyData(tenant.tenantId, customerId);
  }

  @Post(":customerId/privacy/anonymize")
  @ApiOkResponse({
    description:
      "Dados pessoais anonimizados com fatos históricos preservados.",
  })
  anonymize(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
    @Body() body: unknown,
  ) {
    const parsed = anonymizeCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_CUSTOMER_ANONYMIZATION",
        message: "Confirme a anonimização e informe o motivo da solicitação.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.customersService.anonymize(
      tenant.tenantId,
      customerId,
      parsed.data,
    );
  }

  private parse(body: unknown) {
    const parsed = saveCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_CUSTOMER",
        message: "Revise os dados da cliente antes de salvar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return parsed.data;
  }
}
