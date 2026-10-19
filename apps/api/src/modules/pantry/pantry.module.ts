import { Module } from "@nestjs/common";
import { PantryController } from "./pantry.controller";
import { PantryService } from "./pantry.service";

@Module({
  controllers: [PantryController],
  providers: [PantryService],
})
export class PantryModule {}
