import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, toErrorMessage } from "@/lib/errors";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    const issues = error.flatten();
    return NextResponse.json(
      {
        error: "Ret de markerede felter, og prøv igen.",
        fieldErrors: issues.fieldErrors,
        formErrors: issues.formErrors,
      },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }

  console.error(error);
  return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
}
