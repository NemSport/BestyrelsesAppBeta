import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, toErrorMessage } from "@/lib/errors";

function redactErrorMessage(message: string) {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[redacted-id]",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-value]");
}

function safeServerError(error: unknown) {
  const record =
    typeof error === "object" && error
      ? (error as { code?: unknown; message?: unknown; name?: unknown })
      : null;
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof record?.name === "string"
          ? record.name
          : "UnknownError",
    code: typeof record?.code === "string" ? record.code : undefined,
    message:
      process.env.NODE_ENV !== "production" &&
      typeof record?.message === "string"
        ? redactErrorMessage(record.message)
        : undefined,
  };
}

export function apiError(
  error: unknown,
  options?: { fallbackMessage?: string },
) {
  if (error instanceof ZodError) {
    const issues = error.flatten();
    if (process.env.NODE_ENV !== "production") {
      console.error("API validation failed", {
        fieldErrors: issues.fieldErrors,
        formErrors: issues.formErrors,
        validationErrors: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    return NextResponse.json(
      {
        error: "Ret de markerede felter, og prøv igen.",
        fieldErrors: issues.fieldErrors,
        formErrors: issues.formErrors,
        validationErrors: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    const message =
      error.code === "AUTHORIZATION_FAILED"
        ? "Handlingen kunne ikke gennemføres. Genindlæs siden, eller kontakt en ansvarlig, hvis du fortsat har brug for adgang."
        : error.message;
    return NextResponse.json(
      { error: message, code: error.code },
      { status: error.statusCode },
    );
  }

  console.error("API request failed", safeServerError(error));
  return NextResponse.json(
    { error: options?.fallbackMessage || toErrorMessage(error) },
    { status: 500 },
  );
}
