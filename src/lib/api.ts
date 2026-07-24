import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, toErrorMessage } from "@/lib/errors";

export function apiError(error: unknown) {
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

  console.error(error);
  return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
}
