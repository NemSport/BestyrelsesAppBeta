"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  minHeightClass?: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
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
        class: `rich-text-editor ${minHeightClass} px-3 py-2.5 text-sm outline-none`,
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
          class: `rich-text-editor ${minHeightClass} px-3 py-2.5 text-sm outline-none`,
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
      className={`overflow-hidden rounded-[var(--radius-control)] border bg-surface transition focus-within:ring-2 ${
        invalid
          ? "border-danger focus-within:border-danger focus-within:ring-danger/10"
          : "border-line focus-within:border-forest focus-within:ring-forest/10"
      }`}
    >
      <div
        aria-label="Formatering"
        className="flex min-h-9 flex-wrap items-center gap-0.5 border-b border-line bg-subtle/55 px-1.5 py-1 transition-colors focus-within:bg-subtle"
        role="toolbar"
      >
        <ToolbarButton
          active={editor?.isActive("bold")}
          disabled={!editor}
          label="Fed"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("italic")}
          disabled={!editor}
          label="Kursiv"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          textClassName="italic"
        >
          I
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton
          active={editor?.isActive("bulletList")}
          disabled={!editor}
          label="Punktliste"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <span aria-hidden="true">•</span>
          <span className="sr-only">Punktliste</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("orderedList")}
          disabled={!editor}
          label="Nummereret liste"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton
          active={editor?.isActive("link")}
          disabled={!editor}
          label="Link"
          onClick={updateLink}
        >
          Link
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
              <span className="w-5 text-center underline">U</span>
              Understregning
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("heading", { level: 2 })}
              disabled={!editor}
              expanded
              label="Overskrift"
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <span className="w-5 text-center">H2</span>
              Overskrift
            </ToolbarButton>
            <ToolbarButton
              active={editor?.isActive("blockquote")}
              disabled={!editor}
              expanded
              label="Citat"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <span className="w-5 text-center">&quot;</span>
              Citat
            </ToolbarButton>
            <div className="my-1 h-px bg-line" />
            <ToolbarButton
              disabled={!editor?.can().chain().focus().undo().run()}
              expanded
              label="Fortryd"
              onClick={() => editor?.chain().focus().undo().run()}
            />
            <ToolbarButton
              disabled={!editor?.can().chain().focus().redo().run()}
              expanded
              label="Gentag"
              onClick={() => editor?.chain().focus().redo().run()}
            />
            <ToolbarButton
              disabled={!editor}
              expanded
              label="Ryd formatering"
              onClick={() =>
                editor?.chain().focus().unsetAllMarks().clearNodes().run()
              }
            />
          </div>
        </details>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
