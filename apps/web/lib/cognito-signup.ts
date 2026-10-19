import {
  CodeDeliveryFailureException,
  CodeMismatchException,
  ExpiredCodeException,
  InvalidPasswordException,
  LimitExceededException,
  TooManyRequestsException,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { authJson } from "@/lib/cognito-password-auth";

export function signupFailure(error: unknown) {
  if (
    error instanceof TooManyRequestsException ||
    error instanceof LimitExceededException
  ) {
    return authJson(
      {
        code: "try-later",
        message:
          "Houve muitas tentativas. Aguarde um instante e tente novamente.",
      },
      429,
    );
  }

  if (error instanceof UsernameExistsException) {
    return authJson(
      {
        code: "account-exists",
        message:
          "Este e-mail já tem uma conta. Volte para entrar ou recupere sua senha.",
      },
      409,
    );
  }

  if (error instanceof InvalidPasswordException) {
    return authJson(
      {
        code: "invalid-password",
        message:
          "A senha precisa ter ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo.",
      },
      400,
    );
  }

  if (error instanceof ExpiredCodeException) {
    return authJson(
      {
        code: "expired-code",
        message: "Este código venceu. Peça um novo e tente novamente.",
      },
      400,
    );
  }

  if (error instanceof CodeMismatchException) {
    return authJson(
      {
        code: "invalid-code",
        message: "O código não confere. Revise os 6 números e tente novamente.",
      },
      400,
    );
  }

  if (error instanceof CodeDeliveryFailureException) {
    return authJson(
      {
        code: "delivery-failed",
        message:
          "Não conseguimos enviar o código agora. Confira o e-mail e tente novamente.",
      },
      503,
    );
  }

  return authJson(
    {
      code: "signup-failed",
      message: "Não foi possível criar a conta agora. Tente novamente.",
    },
    400,
  );
}

export function validNewPassword(value: string) {
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}
