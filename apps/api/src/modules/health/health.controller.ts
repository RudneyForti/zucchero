import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "../../database/database.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @Get("live")
  @ApiOkResponse({ description: "O processo da API está vivo." })
  live() {
    return { status: "ok" as const };
  }

  @Get("ready")
  @ApiOkResponse({ description: "A API está pronta para receber tráfego." })
  async ready() {
    if (!this.database.isConfigured) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException(
          "Banco de dados não configurado.",
        );
      }
      return { status: "ok" as const, database: "not-configured" as const };
    }

    try {
      await this.database.ping();
      return { status: "ok" as const, database: "connected" as const };
    } catch {
      throw new ServiceUnavailableException("Banco de dados indisponível.");
    }
  }
}
