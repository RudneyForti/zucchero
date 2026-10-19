import { Module } from "@nestjs/common";
import { ProductionModule } from "../production/production.module";
import { TodayController } from "./today.controller";
import { TodayService } from "./today.service";

@Module({
  imports: [ProductionModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
