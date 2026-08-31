import type {
  ComponentPropsWithRef,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";

export function Input({
  className,
  ...props
}: ComponentPropsWithRef<"input">) {
  return <input className={clsx("field", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("field min-h-28", className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("field", className)} {...props} />;
}
