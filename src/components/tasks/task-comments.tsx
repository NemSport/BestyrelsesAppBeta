"use client";

import { useEffect, useState } from "react";

import { Button, EmptyState, Textarea } from "@/components/ui";
import type { TaskCommentView } from "@/types/domain";

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TaskComments({
  organizationId,
  taskId,
}: {
  organizationId: string;
  taskId: string;
}) {
  const [comments, setComments] = useState<TaskCommentView[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadComments() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/tasks/${taskId}/comments?organizationId=${encodeURIComponent(organizationId)}`,
        );
        const result = (await response.json()) as TaskCommentView[] & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Kommentarerne kunne ikke hentes.");
        }
        if (active) setComments(result);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Kommentarerne kunne ikke hentes.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadComments();
    return () => {
      active = false;
    };
  }, [organizationId, taskId]);

  async function addComment() {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError("Kommentaren skal udfyldes.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          body: trimmedBody,
        }),
      });
      const result = (await response.json()) as TaskCommentView & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Kommentaren kunne ikke gemmes.");
        return;
      }
      setComments((current) => [result, ...current]);
      setBody("");
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-line pt-5">
      <div>
        <h3 className="font-semibold text-ink">Kommentarer</h3>
        <p className="mt-1 text-sm text-muted">
          Saml korte statusopdateringer og praktisk opfølgning på opgaven.
        </p>
      </div>

      {error ? (
        <p className="alert-danger rounded-[var(--radius-control)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="label" htmlFor={`task-comment-${taskId}`}>
          Ny kommentar
        </label>
        <Textarea
          className="min-h-20"
          id={`task-comment-${taskId}`}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Skriv en kort opdatering..."
          value={body}
        />
        <div className="flex justify-end">
          <Button
            disabled={saving || !body.trim()}
            onClick={() => void addComment()}
            size="sm"
          >
            {saving ? "Gemmer..." : "Tilføj kommentar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Henter kommentarer...</p>
      ) : comments.length ? (
        <ol className="divide-y divide-line border-y border-line">
          {comments.map((comment) => (
            <li className="py-3" key={comment.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {comment.author?.full_name || "Ukendt medlem"}
                </p>
                <time
                  className="text-xs text-muted"
                  dateTime={comment.created_at}
                >
                  {formatCommentTime(comment.created_at)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          compact
          description="Tilføj en kommentar, når der er nyt om opgaven."
          title="Der er endnu ingen kommentarer."
        />
      )}
    </section>
  );
}
