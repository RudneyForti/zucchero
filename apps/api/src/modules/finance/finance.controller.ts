import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { RequireAccess } from "../identity/access-control";
import { CurrentTenant } from "../identity/current-tenant.decorator";
import type { TenantContext } from "../identity/tenant-context";
import {
  createExpenseCategorySchema,
  createOperatingExpenseSchema,
  financeMonthSchema,
  financeYearSchema,
  instantiateExpenseRecurrenceSchema,
  registerExpensePaymentSchema,
  reverseExpensePaymentSchema,
} from "./finance.contract";
import { FinanceService } from "./finance.service";

@ApiTags("finance")
@RequireAccess("financial")
@ApiHeader({ name: "x-demo-tenant-id", required: true })
@Controller("finance")
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly service: FinanceService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: "Leitura mensal de caixa, contas e recorrências.",
  })
  getWorkspace(
    @CurrentTenant() tenant: TenantContext,
    @Query("month") month: unknown,
  ) {
    const parsed = financeMonthSchema.safeParse(month);
    if (!parsed.success)
      throw new BadRequestException("Informe o mês no formato AAAA-MM.");
    return this.service.getForTenant(tenant.tenantId, parsed.data);
  }

  @Get("year")
  @ApiOkResponse({ description: "Leitura consolidada dos doze meses do ano." })
  getYearWorkspace(
    @CurrentTenant() tenant: TenantContext,
    @Query("year") year: unknown,
  ) {
    const parsed = financeYearSchema.safeParse(year);
    if (!parsed.success)
      throw new BadRequestException("Informe o ano com quatro dígitos.");
    return this.service.getYearForTenant(tenant.tenantId, parsed.data);
  }

  @Get("export")
  @ApiOkResponse({ description: "Exportação CSV do fechamento mensal." })
  async exportMonth(
    @CurrentTenant() tenant: TenantContext,
    @Query("month") month: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = financeMonthSchema.safeParse(month);
    if (!parsed.success)
      throw new BadRequestException("Informe o mês no formato AAAA-MM.");
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header(
      "content-disposition",
      `attachment; filename="financeiro-${parsed.data}.csv"`,
    );
    return this.service.exportForTenant(tenant.tenantId, parsed.data);
  }

  @Post("categories")
  @ApiCreatedResponse({ description: "Categoria operacional criada." })
  createCategory(
    @CurrentTenant() tenant: TenantContext,
    @Query("month") month: unknown,
    @Body() body: unknown,
  ) {
    const parsedMonth = financeMonthSchema.safeParse(month);
    const parsed = createExpenseCategorySchema.safeParse(body);
    if (!parsedMonth.success || !parsed.success)
      throw new BadRequestException("Revise a categoria e o mês.");
    return this.service.createCategory(
      tenant.tenantId,
      parsed.data,
      parsedMonth.data,
    );
  }

  @Post("expenses")
  createExpense(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = createOperatingExpenseSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise os dados desta conta.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.createExpense(tenant.tenantId, parsed.data);
  }

  @Post("recurrences/:recurrenceId/instantiate")
  instantiate(
    @CurrentTenant() tenant: TenantContext,
    @Param("recurrenceId", new ParseUUIDPipe()) recurrenceId: string,
    @Body() body: unknown,
  ) {
    const parsed = instantiateExpenseRecurrenceSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Revise o mês escolhido.");
    return this.service.instantiateRecurrence(
      tenant.tenantId,
      recurrenceId,
      parsed.data,
    );
  }

  @Post("expenses/:expenseId/payments")
  pay(
    @CurrentTenant() tenant: TenantContext,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerExpensePaymentSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Revise o pagamento.",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.service.registerPayment(
      tenant.tenantId,
      expenseId,
      parsed.data,
    );
  }

  @Post("expenses/:expenseId/payments/:paymentId/reverse")
  reverse(
    @CurrentTenant() tenant: TenantContext,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Param("paymentId", new ParseUUIDPipe()) paymentId: string,
    @Body() body: unknown,
  ) {
    const parsed = reverseExpensePaymentSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        "Conte por que o pagamento será estornado.",
      );
    return this.service.reversePayment(
      tenant.tenantId,
      expenseId,
      paymentId,
      parsed.data,
    );
  }
}
