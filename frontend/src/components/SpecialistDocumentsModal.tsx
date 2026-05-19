import axios from "axios";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSpecialistDocument,
  fetchSpecialistDocuments,
  uploadSpecialistDocument,
} from "../api/endpoints";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatPersonDisplayLastFirst } from "../lib/personName";
import type { Specialist } from "../types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  return "DOC";
}

function parseApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : "Error inesperado";
  }
  const data = err.response?.data;
  if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  return err.message || "No se pudo conectar con el servidor";
}

type Props = {
  open: boolean;
  specialist: Specialist | null;
  onClose: () => void;
};

export function SpecialistDocumentsModal({ open, specialist, onClose }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const specialistId = specialist?.id ?? "";

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["specialist-documents", specialistId],
    queryFn: () => fetchSpecialistDocuments(specialistId),
    enabled: open && Boolean(specialistId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadSpecialistDocument(specialistId, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialist-documents", specialistId] });
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      setError(null);
    },
    onError: (err) => setError(parseApiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (documentId: string) => deleteSpecialistDocument(specialistId, documentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["specialist-documents", specialistId] });
      await qc.invalidateQueries({ queryKey: ["specialists"] });
      setPendingDeleteId(null);
      setError(null);
    },
    onError: (err) => {
      setPendingDeleteId(null);
      setError(parseApiError(err));
    },
  });

  if (!open || !specialist) return null;

  const pending = uploadMut.isPending || deleteMut.isPending;
  const displayName = formatPersonDisplayLastFirst(specialist.lastName, specialist.firstName);
  const pendingDeleteDoc = documents.find((d) => d.id === pendingDeleteId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl ring-1 ring-slate-900/5"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Documentación</h2>
            <p className="mt-1 text-sm text-slate-600">{displayName}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              uploadMut.mutate(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
          >
            {uploadMut.isPending ? "Subiendo…" : "+ Agregar documento"}
          </button>
          <p className="mt-2 text-xs text-slate-500">PDF, Word (.doc/.docx) o imagen. Máximo 15 MB.</p>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <p className="text-sm text-slate-500">Cargando documentos…</p>
          ) : documents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No hay documentos cargados.
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                >
                  <span className="text-lg" aria-hidden>
                    {fileIcon(doc.mimeType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-sky-700 hover:underline"
                    >
                      {doc.fileName}
                    </a>
                    <p className="text-xs text-slate-500">{formatFileSize(doc.fileSize)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setPendingDeleteId(doc.id)}
                    className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Eliminar documento"
        message={
          pendingDeleteDoc
            ? `¿Eliminar "${pendingDeleteDoc.fileName}"? Esta acción no se puede deshacer.`
            : "¿Eliminar este documento?"
        }
        confirmLabel="Eliminar"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) deleteMut.mutate(pendingDeleteId);
        }}
      />
    </div>
  );
}





