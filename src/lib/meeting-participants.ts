export type ExternalAttendeeInput = {
  name: string;
  email: string;
  mobile: string;
  roleNote: string;
};

export function hasExternalAttendeeInput(attendee: ExternalAttendeeInput) {
  return Boolean(
    attendee.name.trim() ||
    attendee.email.trim() ||
    attendee.mobile.trim() ||
    attendee.roleNote.trim(),
  );
}

export function remapExternalAttendeeFieldErrors(
  fieldErrors: Record<string, string>,
  originalIndices: number[],
) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([key, message]) => {
      const match = key.match(
        /^externalAttendees\.(\d+)\.(name|email|mobile|roleNote)$/,
      );
      if (!match) return [key, message];
      const originalIndex = originalIndices[Number(match[1])];
      return [
        originalIndex === undefined
          ? key
          : `externalAttendees.${originalIndex}.${match[2]}`,
        message,
      ];
    }),
  );
}
