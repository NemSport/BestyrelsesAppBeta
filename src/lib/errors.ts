export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Du skal være logget ind.") {
    super(message, 401, "AUTHENTICATION_REQUIRED");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Du har ikke adgang til at udføre denne handling.") {
    super(message, 403, "AUTHORIZATION_FAILED");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} blev ikke fundet.`, 404, "NOT_FOUND");
  }
}

export function toErrorMessage(error: unknown) {
  console.error(error);
  return "Der opstod en uventet fejl. Prøv igen.";
}
