import { Module } from "@nestjs/common";
import { FiscalImportController } from "./fiscal-import.controller";
import { FiscalImportService } from "./fiscal-import.service";

@Module({
  controllers: [FiscalImportController],
  providers: [FiscalImportService],
})
export class FiscalImportModule {}
