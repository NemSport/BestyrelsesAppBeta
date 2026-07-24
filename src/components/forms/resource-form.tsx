"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  ActionBar,
  Button,
  Input,
  MutationFeedback,
  Select,
  Textarea,
} from "@/components/ui";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";

export type ResourceFormField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "datetime-local" | "date" | "select" | "radio";
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
  const initialValuesRef = useRef(
    Object.fromEntries(
      fields.map((field) => [field.name, field.defaultValue ?? ""]),
    ) as Record<string, string>,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialValuesRef.current,
  );
  const mutation = useMutationFeedback();
  const dirty =
    JSON.stringify(fieldValues) !== JSON.stringify(initialValuesRef.current);
  const confirmDiscard = useUnsavedChanges(dirty && !mutation.pending);
  const fieldOrder = fields.map((field) => field.name);

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    focusInvalidField(firstFieldError(errors, fieldOrder));
  }

  async function submit(formData: FormData) {
    if (!mutation.begin("Ændringerne gemmes...")) return;
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
      showFieldErrors(clientErrors);
      mutation.fail("Ret de markerede felter, og prøv igen.");
      return;
    }

    try {
      const result = await readMutationResponse<Record<string, unknown>>(
        await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        "Formularen kunne ikke gemmes. Prøv igen.",
      );
      initialValuesRef.current = { ...fieldValues };
      mutation.succeed("Ændringerne er gemt.");

      if (onSuccess) {
        onSuccess(result);
        return;
      }
      if (successPath) {
        router.push(successPath.replace(":id", String(result.id)));
        router.refresh();
      }
    } catch (caught) {
      if (caught instanceof MutationRequestError) {
        showFieldErrors(caught.fieldErrors);
        mutation.fail(caught.message);
      } else {
        mutation.fail(
          "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
        );
      }
    }
  }

  return (
    <form action={submit} className="space-y-4" noValidate>
      <MutationFeedback feedback={mutation.feedback} />
      {fields.map((field) => {
        const visible =
          !field.visibleWhen ||
          fieldValues[field.visibleWhen.field] === field.visibleWhen.equals;
        if (!visible) return null;

        const describedBy = fieldErrors[field.name]
          ? `${field.name}-error`
          : undefined;
        const sharedProps = {
          "aria-describedby": describedBy,
          "aria-invalid": Boolean(fieldErrors[field.name]),
          id: field.name,
          name: field.name,
        };

        return (
          <div key={field.name}>
            <label className="label" htmlFor={field.name}>
              {field.label}
            </label>
            {field.helpText ? (
              <p className="mb-2 text-xs text-muted">{field.helpText}</p>
            ) : null}
            {field.type === "radio" ? (
              <div
                aria-describedby={describedBy}
                aria-invalid={Boolean(fieldErrors[field.name])}
                className="flex flex-wrap gap-3"
                id={field.name}
                role="radiogroup"
                tabIndex={-1}
              >
                {field.options?.map((option) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium"
                    key={option.value}
                  >
                    <input
                      aria-describedby={describedBy}
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
                {...sharedProps}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                value={fieldValues[field.name]}
              />
            ) : field.type === "select" ? (
              <Select
                {...sharedProps}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                value={fieldValues[field.name]}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                {...sharedProps}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                required={field.required}
                type={field.type || "text"}
                value={fieldValues[field.name]}
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
          <Button disabled={mutation.pending} type="submit">
            {mutation.pending ? "Gemmer..." : submitLabel}
          </Button>
          {secondaryAction ? (
            <Button
              disabled={mutation.pending}
              onClick={() => {
                if (confirmDiscard()) secondaryAction.onClick();
              }}
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
