import type { TableRow } from "@/types/database";

export type MeetingMaterialContentType = "agenda" | "tasks" | "minutes";
export type MeetingTaskListMode = "general" | "personal";

export type MeetingMaterialRecipientSnapshot = {
  kind: "member" | "external";
  userId: string | null;
  name: string;
  email: string;
};

export type MeetingMaterialDocumentSnapshot = {
  relationId: string;
  documentId: string;
  versionId: string;
  name: string;
  fileName: string;
  mimeType: string;
};

export type MeetingMaterialDispatchHistory = Omit<
  TableRow<"meeting_material_dispatches">,
  "content_types" | "task_list_mode" | "recipient_snapshot" | "document_snapshot"
> & {
  content_types: MeetingMaterialContentType[];
  task_list_mode: MeetingTaskListMode | null;
  recipient_snapshot: MeetingMaterialRecipientSnapshot[];
  document_snapshot: MeetingMaterialDocumentSnapshot[];
  senderName: string;
};
