"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { sanitizeRichText } from "@/lib/rich-text";

function ToolbarButton({
  label,
  children,
  active = false,
  disabled = false,
  onClick,
  textClassName = "",
  expanded = false,
}: {
  label: string;
  children?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  textClassName?: string;
  expanded?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex min-h-8 items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-7 ${
        expanded
          ? "w-full justify-start gap-2 px-2 py-1.5 text-xs"
          : "min-w-8 sm:min-w-7"
      } ${
        active
          ? "border-accent/40 bg-accent-soft text-forest"
          : "border-transparent bg-transparent text-muted hover:border-line hover:bg-surface hover:text-ink"
      } ${textClassName}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children ?? label}
    </button>
  );
}

function ToolbarSeparator() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  minHeightClass = "min-h-28",
  describedBy,
  invalid = false,
  placeholder = "Skriv her...",
  compactToolbar = false,
  footer,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  minHeightClass?: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  compactToolbar?: boolean;
  footer?: React.ReactNode;
}) {
  const onChangeRef = useRef(onChange);
  const [, renderToolbar] = useState(0);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2],
        },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        autolink: false,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: sanitizeRichText(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-describedby": describedBy ?? "",
        "aria-invalid": String(invalid),
        "aria-multiline": "true",
        class: `rich-text-editor ${minHeightClass} overflow-visible px-3 py-3 text-sm leading-6 outline-none`,
        id,
        role: "textbox",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChangeRef.current(sanitizeRichText(updatedEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;

    const updateToolbar = () => renderToolbar((version) => version + 1);
    editor.on("selectionUpdate", updateToolbar);
    editor.on("transaction", updateToolbar);

    return () => {
      editor.off("selectionUpdate", updateToolbar);
      editor.off("transaction", updateToolbar);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    editor.setOptions({
      editorProps: {
        attributes: {
          "aria-describedby": describedBy ?? "",
          "aria-invalid": String(invalid),
          "aria-multiline": "true",
          class: `rich-text-editor ${minHeightClass} overflow-visible px-3 py-3 text-sm leading-6 outline-none`,
          id,
          role: "textbox",
        },
      },
    });
  }, [describedBy, editor, id, invalid, minHeightClass]);

  useEffect(() => {
    if (!editor) return;

    const sanitizedValue = sanitizeRichText(value);
    const currentValue = sanitizeRichText(editor.getHTML());
    if (sanitizedValue !== currentValue) {
      editor.commands.setContent(sanitizedValue, { emitUpdate: false });
    }
  }, [editor, value]);

  function updateLink() {
    if (!editor) return;

    const currentHref = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(
      "Indsæt linkadresse (https://, http:// eller mailto:)",
      currentHref ?? "",
    );
    if (href === null) return;

    const trimmedHref = href.trim();
    if (!trimmedHref) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(trimmedHref)) {
      window.alert("Linket skal begynde med https://, http:// eller mailto:.");
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: trimmedHref })
      .run();
  }

  return (
    <div
      className={`min-w-0 overflow-visible border bg-surface transition focus-within:ring-2 ${
        footer
          ? "rounded-[var(--radius-panel)] shadow-sm"
          : "rounded-[var(--radius-control)]"
      } ${
        invalid
          ? "border-danger focus-within:border-danger focus-within:ring-danger/10"
          : "border-line focus-within:border-brand focus-within:ring-brand/15"
      }`}
    >
      {compactToolbar ? null : (
        <div
          aria-label="Formatering"
          className={`flex min-h-9 flex-wrap items-center gap-0.5 overflow-visible border-b border-line bg-subtle/55 px-2 py-1 transition-colors focus-within:bg-subtle ${
            footer
              ? "rounded-t-[var(--radius-panel)]"
              : "rounded-t-[var(--radius-control)]"
          }`}
          role="toolbar"
        >
          <label className="sr-only" htmlFor={`${id}-text-style`}>
            Teksttype
          </label>
          <select
            aria-label="Teksttype"
            className="mr-1 min-h-7 rounded-md border border-line bg-surface px-2 text-[11px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
            disabled={!editor}
            id={`${id}-text-style`}
            onChange={(event) => {
              if (event.target.value === "heading") {
                editor?.chain().focus().setHeading({ level: 2 }).run();
              } else {
                editor?.chain().focus().setParagraph().run();
              }
            }}
            value={
              editor?.isActive("heading", { level: 2 })
                ? "heading"
                : "paragraph"
            }
          >
            <option value="paragraph">Brødtekst</option>
            <option value="heading">Overskrift</option>
          </select>
          <ToolbarButton
            active={editor?.isActive("bold")}
            disabled={!editor}
            label="Fed"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold aria-hidden="true" size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("italic")}
            disabled={!editor}
            label="Kursiv"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            textClassName="italic"
          >
            <Italic aria-hidden="true" size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton
            active={editor?.isActive("bulletList")}
            disabled={!editor}
            label="Punktliste"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List aria-hidden="true" size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("orderedList")}
            disabled={!editor}
            label="Nummereret liste"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered aria-hidden="true" size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton
            active={editor?.isActive("link")}
            disabled={!editor}
            label="Link"
            onClick={updateLink}
          >
            <Link2 aria-hidden="true" size={14} strokeWidth={2} />
          </ToolbarButton>
          <details className="group relative ml-auto">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-semibold text-muted transition hover:border-line hover:bg-surface hover:text-ink sm:min-h-7 [&::-webkit-details-marker]:hidden">
              Flere
              <span
                aria-hidden="true"
                className="text-[9px] transition group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.25rem)] z-20 grid w-44 gap-0.5 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
              <ToolbarButton
                active={editor?.isActive("underline")}
                disabled={!editor}
                expanded
                label="Understregning"
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon aria-hidden="true" className="w-5" size={14} />
                Understregning
              </ToolbarButton>
              <ToolbarButton
                active={editor?.isActive("blockquote")}
                disabled={!editor}
                expanded
                label="Citat"
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                <Quote aria-hidden="true" className="w-5" size={14} />
                Citat
              </ToolbarButton>
              <div className="my-1 h-px bg-line" />
              <ToolbarButton
                disabled={!editor?.can().chain().focus().undo().run()}
                expanded
                label="Fortryd"
                onClick={() => editor?.chain().focus().undo().run()}
              >
                <Undo2 aria-hidden="true" className="w-5" size={14} />
                Fortryd
              </ToolbarButton>
              <ToolbarButton
                disabled={!editor?.can().chain().focus().redo().run()}
                expanded
                label="Gentag"
                onClick={() => editor?.chain().focus().redo().run()}
              >
                <Redo2 aria-hidden="true" className="w-5" size={14} />
                Gentag
              </ToolbarButton>
              <ToolbarButton
                disabled={!editor}
                expanded
                label="Ryd formatering"
                onClick={() =>
                  editor?.chain().focus().unsetAllMarks().clearNodes().run()
                }
              >
                <RemoveFormatting
                  aria-hidden="true"
                  className="w-5"
                  size={14}
                />
                Ryd formatering
              </ToolbarButton>
            </div>
          </details>
        </div>
      )}
      <EditorContent className="min-w-0" editor={editor} />
      {footer ? (
        <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-b-[var(--radius-panel)] border-t border-line bg-subtle/35 px-3 py-1.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
