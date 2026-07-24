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
