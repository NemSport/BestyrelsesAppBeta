export type ValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export type MutationErrorPayload = {
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  validationErrors?: ValidationIssue[];
};

export class MutationRequestError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly code?: string;

  constructor(
    message: string,
    fieldErrors: Record<string, string>,
    code?: string,
  ) {
    super(message);
    this.name = "MutationRequestError";
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

export function normalizeMutationFieldPath(path: string) {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
    .replace(/^\./, "");
}

export function mutationFieldErrors(payload: MutationErrorPayload | null) {
  const errors: Record<string, string> = {};

  for (const issue of payload?.validationErrors ?? []) {
    const key = normalizeMutationFieldPath(issue.path.join("."));
    if (key && !errors[key]) errors[key] = issue.message;
  }

  for (const [key, messages] of Object.entries(payload?.fieldErrors ?? {})) {
    const normalizedKey = normalizeMutationFieldPath(key);
    if (!errors[normalizedKey] && messages[0]) {
      errors[normalizedKey] = messages[0];
    }
  }

  return errors;
}

export async function readMutationResponse<T>(
  response: Response,
  fallbackMessage: string,
) {
  const payload = (await response.json().catch(() => null)) as
    | (T & MutationErrorPayload)
    | null;

  if (!response.ok) {
    const authorizationMessage =
      response.status === 401 || response.status === 403
        ? "Handlingen kunne ikke gennemføres. Genindlæs siden, eller kontakt en ansvarlig, hvis du fortsat har brug for adgang."
        : null;
    throw new MutationRequestError(
      authorizationMessage || payload?.error || fallbackMessage,
      mutationFieldErrors(payload),
      payload?.code,
    );
  }

  return payload as T;
}

export function firstFieldError(
  fieldErrors: Record<string, string>,
  fieldOrder: string[],
) {
  return (
    fieldOrder.find((field) => Boolean(fieldErrors[field])) ??
    Object.keys(fieldErrors)[0] ??
    null
  );
}
