export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-danger" id={id}>
      {message}
    </p>
  );
}
