import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { CustomersController } from "./modules/customers/customers.controller";
import { CustomersModule } from "./modules/customers/customers.module";
import { FinanceController } from "./modules/finance/finance.controller";
import { FinanceModule } from "./modules/finance/finance.module";
import { EquipmentController } from "./modules/equipment/equipment.controller";
import { EquipmentModule } from "./modules/equipment/equipment.module";
import { HealthModule } from "./modules/health/health.module";
import { TenantContextMiddleware } from "./modules/identity/tenant-context.middleware";
import { IdentityModule } from "./modules/identity/identity.module";
import { OrdersController } from "./modules/orders/orders.controller";
import { OrdersModule } from "./modules/orders/orders.module";
import { PantryController } from "./modules/pantry/pantry.controller";
import { PantryModule } from "./modules/pantry/pantry.module";
import { RecipesController } from "./modules/recipes/recipes.controller";
import { RecipesModule } from "./modules/recipes/recipes.module";
import { ProductionController } from "./modules/production/production.controller";
import { ProductionModule } from "./modules/production/production.module";
import { TodayController } from "./modules/today/today.controller";
import { TodayModule } from "./modules/today/today.module";
import { SettingsController } from "./modules/settings/settings.controller";
import { SettingsModule } from "./modules/settings/settings.module";
import { FiscalImportController } from "./modules/fiscal-import/fiscal-import.controller";
import { FiscalImportModule } from "./modules/fiscal-import/fiscal-import.module";

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityModule,
    TodayModule,
    PantryModule,
    RecipesModule,
    ProductionModule,
    OrdersModule,
    CustomersModule,
    FinanceModule,
    EquipmentModule,
    SettingsModule,
    FiscalImportModule,
  ],
  providers: [TenantContextMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes(
        TodayController,
        PantryController,
        RecipesController,
        ProductionController,
        OrdersController,
        CustomersController,
        FinanceController,
        EquipmentController,
        SettingsController,
        FiscalImportController,
      );
  }
}
