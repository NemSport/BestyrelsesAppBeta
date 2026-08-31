import type { Database, TableRow } from "@/types/database";

export type DocumentRelationType = Database["public"]["Enums"]["document_relation_type"];
export type DocumentCategory = TableRow<"document_categories">;
export type DocumentVersion = TableRow<"document_versions">;
export type DocumentRelation = TableRow<"document_relations"> & { label: string };

export type DocumentListItem = TableRow<"documents"> & {
  categoryName: string | null;
  committeeName: string | null;
  uploaderName: string;
  relationCount: number;
  currentVersion: DocumentVersion | null;
};

export type DocumentDetail = DocumentListItem & {
  versions: Array<DocumentVersion & { uploaderName: string }>;
  relations: DocumentRelation[];
  canEdit: boolean;
  canManageCategories: boolean;
};

export type DocumentRegisterData = {
  documents: DocumentListItem[];
  categories: DocumentCategory[];
  committees: Array<{ id: string; name: string }>;
  canManageCategories: boolean;
};

export type DocumentPickerData = Pick<
  DocumentRegisterData,
  "documents" | "categories"
>;

export type RelatedDocumentView = {
  relationId: string;
  relationType: DocumentRelationType;
  meetingId: string | null;
  agendaItemId: string | null;
  document: DocumentListItem;
};

export type MeetingDocumentContext = {
  meetingDocuments: RelatedDocumentView[];
  agendaItemDocuments: RelatedDocumentView[];
};
