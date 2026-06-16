import { isRichTextEmpty, sanitizeRichText } from "@/lib/rich-text";

export function RichTextContent({
  value,
  emptyText = "Ikke angivet",
  className = "",
}: {
  value: string | null | undefined;
  emptyText?: string;
  className?: string;
}) {
  if (isRichTextEmpty(value)) {
    return <p className={`text-muted ${className}`}>{emptyText}</p>;
  }

  return (
    <div
      className={`rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
    />
  );
}
