import {
  BadRequestException,
  Body,
  Controller,
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
  captureFiscalDocumentSchema,
  confirmFiscalDocumentSchema,
} from "./fiscal-import.contract";
import { FiscalImportService } from "./fiscal-import.service";

@ApiTags("fiscal-documents")
@RequireAccess("operational")
@ApiHeader({
  name: "x-demo-tenant-id",
  required: true,
  description:
    "Somente desenvolvimento; será substituído pelo token validado do provedor.",
})
@Controller("fiscal-documents")
export class FiscalImportController {
  constructor(
    @Inject(FiscalImportService)
    private readonly fiscalImportService: FiscalImportService,
  ) {}

  @Post("capture")
  @ApiCreatedResponse({
    description: "NFC-e capturada para revisão, sem alterar o estoque.",
  })
  @ApiBadRequestResponse({ description: "Chave ou texto da nota inválido." })
  capture(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = captureFiscalDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_FISCAL_CAPTURE",
        message: "Revise a chave e os itens copiados da NFC-e.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.fiscalImportService.capture(tenant.tenantId, parsed.data);
  }

  @Post(":documentId/confirm")
  @ApiOkResponse({
    description: "Linhas confirmadas e transformadas em lotes de compra.",
  })
  @ApiConflictResponse({
    description: "Documento já processado ou indisponível para revisão.",
  })
  confirm(
    @CurrentTenant() tenant: TenantContext,
    @Param("documentId", new ParseUUIDPipe()) documentId: string,
    @Body() body: unknown,
  ) {
    const parsed = confirmFiscalDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_FISCAL_CONFIRMATION",
        message: "Associe todos os produtos e revise as validades.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.fiscalImportService.confirm(
      tenant.tenantId,
      documentId,
      parsed.data,
    );
  }
}
