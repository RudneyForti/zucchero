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
  confirmOrderSchema,
  deliveryQuoteRequestSchema,
  registerReceiptSchema,
  registerDirectExpenseSchema,
  replanOrderSchema,
  reverseReceiptSchema,
  reverseDirectExpenseSchema,
  updateOrderStatusSchema,
} from "./orders.contract";
import { OrdersService } from "./orders.service";

@ApiTags("orders")
@ApiHeader({
  name: "x-demo-tenant-id",
  required: true,
  description:
    "Somente desenvolvimento; será substituído pela identidade validada.",
})
@Controller("orders")
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly ordersService: OrdersService,
  ) {}

  @Get()
  @RequireAccess("orders-read")
  @ApiOkResponse({ description: "Pedidos confirmados da empresa." })
  getOrders(@CurrentTenant() tenant: TenantContext) {
    return this.ordersService.getForTenant(tenant.tenantId);
  }

  @Post("delivery-quote")
  @RequireAccess("operational")
  @ApiOkResponse({
    description: "Distância e custo da entrega calculados pelo Google Maps.",
  })
  @ApiBadRequestResponse({ description: "Cliente ou endereço inválido." })
  quoteDelivery(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = deliveryQuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_DELIVERY_QUOTE",
        message: "Escolha um endereço válido para calcular a entrega.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.quoteDelivery(tenant.tenantId, parsed.data);
  }

  @Post("confirm")
  @RequireAccess("operational")
  @ApiCreatedResponse({
    description: "Pedido confirmado com snapshot, reservas e compras.",
  })
  @ApiConflictResponse({ description: "Versão da receita desatualizada." })
  @ApiBadRequestResponse({ description: "Dados da encomenda inválidos." })
  confirm(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    const parsed = confirmOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ORDER",
        message: "Revise os dados da encomenda antes de confirmar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.confirm(tenant.tenantId, parsed.data);
  }

  @Put(":orderId/status")
  @RequireAccess("operational")
  @ApiOkResponse({
    description: "Estado operacional atualizado com histórico preservado.",
  })
  @ApiConflictResponse({ description: "Transição de estado não permitida." })
  @ApiBadRequestResponse({ description: "Estado ou motivo inválido." })
  updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ORDER_STATUS",
        message: "Revise o próximo passo antes de continuar.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.updateStatus(
      tenant.tenantId,
      orderId,
      parsed.data,
    );
  }

  @Put(":orderId/replan")
  @RequireAccess("operational")
  @ApiOkResponse({
    description: "Entrega e trabalho ainda não iniciado foram replanejados.",
  })
  @ApiConflictResponse({ description: "O novo prazo não comporta a produção." })
  @ApiBadRequestResponse({ description: "Nova data de entrega inválida." })
  replan(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = replanOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REPLAN",
        message: "Revise a nova data e o horário da entrega.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.replan(tenant.tenantId, orderId, parsed.data);
  }

  @Post(":orderId/receipts")
  @RequireAccess("financial")
  @ApiCreatedResponse({
    description: "Recebimento imutável registrado e saldo recalculado.",
  })
  @ApiConflictResponse({ description: "Valor excede o saldo do pedido." })
  registerReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerReceiptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ORDER_RECEIPT",
        message: "Revise o valor, a taxa e a data do recebimento.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.registerReceipt(
      tenant.tenantId,
      orderId,
      parsed.data,
    );
  }

  @Post(":orderId/receipts/:receiptId/reverse")
  @RequireAccess("financial")
  @ApiCreatedResponse({
    description: "Estorno compensatório registrado sem apagar a entrada.",
  })
  reverseReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Param("receiptId", new ParseUUIDPipe()) receiptId: string,
    @Body() body: unknown,
  ) {
    const parsed = reverseReceiptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_RECEIPT_REVERSAL",
        message: "Conte brevemente por que esta entrada será estornada.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.reverseReceipt(
      tenant.tenantId,
      orderId,
      receiptId,
      parsed.data,
    );
  }

  @Post(":orderId/direct-expenses")
  @RequireAccess("financial")
  @ApiCreatedResponse({
    description: "Despesa direta imutável registrada e margem recalculada.",
  })
  registerDirectExpense(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = registerDirectExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ORDER_DIRECT_EXPENSE",
        message: "Revise o gasto real e a parcela que já estava prevista.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.registerDirectExpense(
      tenant.tenantId,
      orderId,
      parsed.data,
    );
  }

  @Post(":orderId/direct-expenses/:expenseId/reverse")
  @RequireAccess("financial")
  @ApiCreatedResponse({
    description: "Estorno compensatório da despesa direta registrado.",
  })
  reverseDirectExpense(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Body() body: unknown,
  ) {
    const parsed = reverseDirectExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_DIRECT_EXPENSE_REVERSAL",
        message: "Conte brevemente por que este gasto será estornado.",
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    return this.ordersService.reverseDirectExpense(
      tenant.tenantId,
      orderId,
      expenseId,
      parsed.data,
    );
  }
}
