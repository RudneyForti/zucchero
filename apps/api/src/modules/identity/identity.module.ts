import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./access-control";
import { LocalIdentityController } from "./local-identity.controller";
import { LocalIdentityService } from "./local-identity.service";

@Module({
  controllers: [LocalIdentityController],
  providers: [
    LocalIdentityService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class IdentityModule {}
