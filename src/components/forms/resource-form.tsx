"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionBar, Button, Input, Select, Textarea } from "@/components/ui";

export type ResourceFormField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "datetime-local"
    | "date"
    | "select"
    | "radio";
  required?: boolean;
  requiredMessage?: string;
  defaultValue?: string | null;
  options?: Array<{ label: string; value: string }>;
  visibleWhen?: { field: string; equals: string };
  helpText?: string;
};

export function ResourceForm({
  endpoint,
  fields,
  hidden,
  submitLabel,
  successPath,
  onSuccess,
  secondaryAction,
  method = "POST",
}: {
  endpoint: string;
  fields: ResourceFormField[];
  hidden?: Record<string, string | null>;
  submitLabel: string;
  successPath?: string;
  onSuccess?: (result: Record<string, unknown>) => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  method?: "POST" | "PATCH";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((field) => [field.name, field.defaultValue ?? ""]),
    ),
  );

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const body = Object.fromEntries(formData.entries()) as Record<
      string,
      unknown
    >;
    Object.assign(body, hidden);
    const clientErrors: Record<string, string> = {};

    for (const field of fields) {
      const visible =
        !field.visibleWhen ||
        body[field.visibleWhen.field] === field.visibleWhen.equals;
      if (!visible) {
        body[field.name] = null;
        continue;
      }
      const value = body[field.name];
      if (field.required && (typeof value !== "string" || !value.trim())) {
        clientErrors[field.name] =
          field.requiredMessage || `${field.label} skal udfyldes`;
      }
      if (
        field.type === "datetime-local" &&
        typeof value === "string" &&
        value.length > 0
      ) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          clientErrors[field.name] = `${field.label} er ugyldig`;
        } else {
          body[field.name] = date.toISOString();
        }
      }
      if (body[field.name] === "") body[field.name] = null;
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError("Formularen kunne ikke gemmes.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const responseFieldErrors = (result.fieldErrors || {}) as Record<
          string,
          string[]
        >;
        setFieldErrors(
          Object.fromEntries(
            Object.entries(responseFieldErrors)
              .filter(([, messages]) => messages.length > 0)
              .map(([name, messages]) => [name, messages[0]]),
          ),
        );
        setError(String(result.error || "Formularen kunne ikke gemmes."));
        return;
      }

      if (onSuccess) {
        onSuccess(result);
        return;
      }
      if (successPath) {
        router.push(successPath.replace(":id", String(result.id)));
        router.refresh();
      }
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="space-y-4" noValidate>
      {error ? (
        <div
          className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">{error}</p>
          {Object.values(fieldErrors).length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {[...new Set(Object.values(fieldErrors))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {fields.map((field) => {
        const visible =
          !field.visibleWhen ||
          fieldValues[field.visibleWhen.field] === field.visibleWhen.equals;
        if (!visible) return null;

        return (
          <div key={field.name}>
            <label className="label" htmlFor={field.name}>
              {field.label}
            </label>
            {field.helpText ? (
              <p className="mb-2 text-xs text-muted">{field.helpText}</p>
            ) : null}
            {field.type === "radio" ? (
              <div className="flex flex-wrap gap-3">
                {field.options?.map((option) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium"
                    key={option.value}
                  >
                    <input
                      checked={fieldValues[field.name] === option.value}
                      name={field.name}
                      onChange={(event) =>
                        setFieldValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      type="radio"
                      value={option.value}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : field.type === "textarea" ? (
              <Textarea
                aria-describedby={
                  fieldErrors[field.name] ? `${field.name}-error` : undefined
                }
                aria-invalid={Boolean(fieldErrors[field.name])}
                defaultValue={field.defaultValue ?? ""}
                id={field.name}
                name={field.name}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              />
            ) : field.type === "select" ? (
              <Select
                aria-describedby={
                  fieldErrors[field.name] ? `${field.name}-error` : undefined
                }
                aria-invalid={Boolean(fieldErrors[field.name])}
                defaultValue={field.defaultValue ?? undefined}
                id={field.name}
                name={field.name}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                aria-describedby={
                  fieldErrors[field.name] ? `${field.name}-error` : undefined
                }
                aria-invalid={Boolean(fieldErrors[field.name])}
                defaultValue={field.defaultValue ?? ""}
                id={field.name}
                name={field.name}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                required={field.required}
                type={field.type || "text"}
              />
            )}
            {fieldErrors[field.name] ? (
              <p
                className="mt-1 text-sm text-danger"
                id={`${field.name}-error`}
              >
                {fieldErrors[field.name]}
              </p>
            ) : null}
          </div>
        );
      })}
      <ActionBar>
        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} type="submit">
            {loading ? "Gemmer..." : submitLabel}
          </Button>
          {secondaryAction ? (
            <Button
              disabled={loading}
              onClick={secondaryAction.onClick}
              type="button"
              variant="secondary"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </ActionBar>
    </form>
  );
}
