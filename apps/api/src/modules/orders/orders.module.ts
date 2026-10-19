import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { GoogleRoutesService } from "./google-routes.service";

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, GoogleRoutesService],
})
export class OrdersModule {}
