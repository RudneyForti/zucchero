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
  createRecipeSchema,
  recipeImportRequestSchema,
} from "./recipes.contract";
import { RecipesService } from "./recipes.service";

@ApiTags("recipes")
@RequireAccess("operational")
@ApiHeader({
  name: "x-demo-tenant-id",
  required: true,
  description:
    "Somente desenvolvimento; será substituído pela identidade validada.",
})
@Controller("recipes")
export class RecipesController {
  constructor(
    @Inject(RecipesService) private readonly recipesService: RecipesService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Receitas e catálogo culinário da empresa." })
  getRecipes(@CurrentTenant() tenant: TenantContext) {
    return this.recipesService.getForTenant(tenant.tenantId);
  }

  @Post()
  @ApiCreatedResponse({ description: "Primeira versão da receita criada." })
  @ApiConflictResponse({
    description: "Nome ou referência de catálogo inválida.",
  })
  @ApiBadRequestResponse({ description: "Dados da receita inválidos." })
  createRecipe(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = createRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_RECIPE",
        message: "Revise os dados da receita antes de continuar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.recipesService.create(tenant.tenantId, parsed.data);
  }

  @Post("import/preview")
  @ApiOkResponse({
    description:
      "Prévia normalizada da receita, sem alterar o caderno ou a despensa.",
  })
  @ApiBadRequestResponse({
    description: "URL insegura ou página sem dados culinários estruturados.",
  })
  previewImport(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = recipeImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Informe o link completo da receita que deseja importar.",
      );
    }
    return this.recipesService.previewImport(tenant.tenantId, parsed.data.url);
  }

  @Post("import")
  @ApiCreatedResponse({
    description:
      "Receita, categorias e grupos ausentes criados como uma edição revisável.",
  })
  importDraft(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = recipeImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Informe o link completo da receita que deseja importar.",
      );
    }
    return this.recipesService.createImportedDraft(
      tenant.tenantId,
      parsed.data.url,
      parsed.data.name,
    );
  }

  @Post(":recipeId/versions")
  @ApiCreatedResponse({ description: "Nova edição da receita criada." })
  createVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param("recipeId", new ParseUUIDPipe()) recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = createRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_RECIPE_VERSION",
        message: "Revise os dados da nova edição antes de continuar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.recipesService.createVersion(
      tenant.tenantId,
      recipeId,
      parsed.data,
    );
  }

  @Put(":recipeId/draft")
  @ApiOkResponse({ description: "Edição da receita atualizada." })
  updateDraft(
    @CurrentTenant() tenant: TenantContext,
    @Param("recipeId", new ParseUUIDPipe()) recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = createRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_RECIPE_DRAFT",
        message: "Revise os dados da edição antes de continuar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.recipesService.updateDraft(
      tenant.tenantId,
      recipeId,
      parsed.data,
    );
  }
}
