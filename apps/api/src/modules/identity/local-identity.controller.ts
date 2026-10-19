import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { LocalIdentityService } from "./local-identity.service";

@Controller("identity/local")
export class LocalIdentityController {
  constructor(private readonly identity: LocalIdentityService) {}

  @Post("signup")
  signup(@Body() body: unknown) {
    return this.identity.signup(body);
  }

  @Post("login")
  login(@Body() body: unknown) {
    return this.identity.login(body);
  }

  @Post("mfa/verify")
  verifyMfa(@Body() body: unknown) {
    return this.identity.verifyMfa(body);
  }

  @Get("invitations/inspect")
  inspectInvitation(@Query("token") token: unknown) {
    return this.identity.inspectInvitation(token);
  }

  @Post("invitations/accept")
  acceptInvitation(@Body() body: unknown) {
    return this.identity.acceptInvitation(body);
  }
}
