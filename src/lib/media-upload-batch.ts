import { detectKind, MAX_FILE_BYTES, type MediaKind } from "@/lib/media-store";

export const DEFAULT_MEDIA_UPLOAD_CONCURRENCY = 3;

export type MediaUploadStatus = "queued" | "uploading" | "succeeded" | "failed";

export interface MediaUploadItem<TResult = unknown> {
  id: string;
  file: File;
  /** Deliberately preserves File.name exactly, including its extension. */
  title: string;
  kind: MediaKind | null;
  status: MediaUploadStatus;
  /** Upload progress as a fraction from 0 to 1. */
  progress: number;
  error: string | null;
  /** Present only when the file itself cannot be uploaded. */
  validationError: string | null;
  result?: TResult;
}

export interface ValidMediaUploadTask {
  id: string;
  file: File;
  title: string;
  kind: MediaKind;
}

export interface MediaUploadBatchOptions<TResult> {
  upload: (item: ValidMediaUploadTask, onProgress: (fraction: number) => void) => Promise<TResult>;
  concurrency?: number;
  onItemUpdate?: (
    item: MediaUploadItem<TResult>,
    items: readonly MediaUploadItem<TResult>[],
  ) => void;
}

export interface MediaUploadValidation {
  kind: MediaKind | null;
  error: string | null;
}

let fallbackId = 0;

function createItemId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackId += 1;
  return `media-upload-${Date.now()}-${fallbackId}`;
}

export function validateMediaUploadFile(file: File): MediaUploadValidation {
  if (file.size > MAX_FILE_BYTES) {
    return { kind: null, error: "File exceeds the 200MB upload limit." };
  }

  const kind = detectKind(file);
  if (!kind) {
    return { kind: null, error: "Unsupported file type." };
  }

  return { kind, error: null };
}

export function createMediaUploadItems<TResult = unknown>(
  files: Iterable<File>,
): MediaUploadItem<TResult>[] {
  return Array.from(files, (file) => {
    const validation = validateMediaUploadFile(file);
    return {
      id: createItemId(),
      file,
      title: file.name,
      kind: validation.kind,
      status: validation.error ? "failed" : "queued",
      progress: 0,
      error: validation.error,
      validationError: validation.error,
    };
  });
}

function normaliseConcurrency(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MEDIA_UPLOAD_CONCURRENCY;
  if (!Number.isFinite(value)) return DEFAULT_MEDIA_UPLOAD_CONCURRENCY;
  return Math.max(1, Math.floor(value));
}

function normaliseProgress(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Upload failed.";
}

/**
 * Uploads only queued, valid items. Each upload is caught independently, so a
 * rejected file never rejects the batch or prevents another queued file from
 * starting. The returned array retains the input order.
 */
export async function runMediaUploadBatch<TResult>(
  sourceItems: readonly MediaUploadItem<TResult>[],
  options: MediaUploadBatchOptions<TResult>,
): Promise<MediaUploadItem<TResult>[]> {
  let items = sourceItems.map((item) => ({ ...item }));

  const notify = (item: MediaUploadItem<TResult>) => {
    if (!options.onItemUpdate) return;
    try {
      options.onItemUpdate(
        { ...item },
        items.map((candidate) => ({ ...candidate })),
      );
    } catch {
      // An observational UI callback must never interrupt another file upload.
    }
  };

  const update = (
    index: number,
    patch: Partial<MediaUploadItem<TResult>>,
  ): MediaUploadItem<TResult> => {
    const next = { ...items[index]!, ...patch };
    items = items.map((item, itemIndex) => (itemIndex === index ? next : item));
    notify(next);
    return next;
  };

  const queue: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.status !== "queued") continue;

    const validation = validateMediaUploadFile(item.file);
    if (validation.error || !validation.kind) {
      update(index, {
        kind: null,
        status: "failed",
        progress: 0,
        error: validation.error ?? "Unsupported file type.",
        validationError: validation.error ?? "Unsupported file type.",
      });
      continue;
    }

    if (item.kind !== validation.kind || item.validationError) {
      update(index, {
        kind: validation.kind,
        error: null,
        validationError: null,
      });
    }
    queue.push(index);
  }

  let nextQueueIndex = 0;
  const worker = async () => {
    while (nextQueueIndex < queue.length) {
      const queueIndex = nextQueueIndex;
      nextQueueIndex += 1;
      const itemIndex = queue[queueIndex]!;
      const queuedItem = update(itemIndex, {
        status: "uploading",
        progress: 0,
        error: null,
        result: undefined,
      });

      if (!queuedItem.kind) {
        update(itemIndex, {
          status: "failed",
          error: "Unsupported file type.",
          validationError: "Unsupported file type.",
        });
        continue;
      }

      const task: ValidMediaUploadTask = {
        id: queuedItem.id,
        file: queuedItem.file,
        title: queuedItem.title,
        kind: queuedItem.kind,
      };

      try {
        const result = await options.upload(task, (fraction) => {
          if (items[itemIndex]?.status !== "uploading") return;
          const progress = normaliseProgress(fraction);
          if (progress === null || progress === items[itemIndex]?.progress) return;
          update(itemIndex, { progress });
        });
        update(itemIndex, {
          status: "succeeded",
          progress: 1,
          error: null,
          result,
        });
      } catch (error) {
        update(itemIndex, {
          status: "failed",
          error: uploadErrorMessage(error),
          validationError: null,
          result: undefined,
        });
      }
    }
  };

  const workerCount = Math.min(normaliseConcurrency(options.concurrency), queue.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return items;
}

/**
 * Re-queues only files that failed during upload. Succeeded files and files
 * with a validation failure are retained unchanged.
 */
export async function retryFailedMediaUploads<TResult>(
  sourceItems: readonly MediaUploadItem<TResult>[],
  options: MediaUploadBatchOptions<TResult>,
): Promise<MediaUploadItem<TResult>[]> {
  const retryItems = sourceItems.map((item) => {
    if (item.status !== "failed" || item.validationError) return { ...item };
    const validation = validateMediaUploadFile(item.file);
    if (validation.error || !validation.kind) {
      return {
        ...item,
        kind: null,
        error: validation.error ?? "Unsupported file type.",
        validationError: validation.error ?? "Unsupported file type.",
      };
    }
    return {
      ...item,
      kind: validation.kind,
      status: "queued" as const,
      progress: 0,
      error: null,
      validationError: null,
      result: undefined,
    };
  });

  return runMediaUploadBatch(retryItems, options);
}
