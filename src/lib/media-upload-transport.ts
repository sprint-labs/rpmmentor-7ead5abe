import { Upload, type HttpRequest } from "tus-js-client";

/** Supabase requires 6 MB TUS chunks. Use resumable uploads above this size. */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
export const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000] as const;

export function formatFileLimit(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return Number.isInteger(gb) ? `${gb} GB` : `${trimTrailingZeros(gb.toFixed(2))} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return Number.isInteger(mb) ? `${mb} MB` : `${trimTrailingZeros(mb.toFixed(1))} MB`;
  }
  const kb = bytes / 1024;
  if (kb >= 1) {
    return Number.isInteger(kb) ? `${kb} KB` : `${trimTrailingZeros(kb.toFixed(1))} KB`;
  }
  return `${bytes} B`;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

export function fileExceedsLimitMessage(limitBytes: number): string {
  return `File exceeds the ${formatFileLimit(limitBytes)} upload limit.`;
}

export function storageDirectOrigin(apiUrl: string): string {
  const url = new URL(apiUrl);
  const projectRef = url.hostname.split(".")[0];
  if (!projectRef) {
    throw new Error("Could not determine the Storage hostname from the Supabase URL.");
  }
  return `${url.protocol}//${projectRef}.storage.supabase.co`;
}

export function resumableUploadEndpoint(apiUrl: string): string {
  return `${storageDirectOrigin(apiUrl)}/storage/v1/upload/resumable`;
}

export function sanitizeObjectFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export function buildObjectPath(gkId: string | null, fileName: string, uniqueId: string): string {
  const folder = gkId ?? "unlinked";
  return `${folder}/${uniqueId}-${sanitizeObjectFileName(fileName)}`;
}

function rawMessageFromError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
  }
  return "";
}

function statusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    originalResponse?: { getStatus?: () => number };
    causingError?: unknown;
  };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.originalResponse?.getStatus === "function") {
    try {
      return record.originalResponse.getStatus();
    } catch {
      /* ignore */
    }
  }
  if (record.causingError) return statusFromError(record.causingError);
  const message = rawMessageFromError(error);
  const match = message.match(/response code:\s*(\d+)/i) ?? message.match(/HTTP\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

export function describeUploadError(error: unknown, limitLabel: string): string {
  const status = statusFromError(error);
  const raw = rawMessageFromError(error);
  const text = raw.toLowerCase();

  const sizeLimit =
    status === 413 ||
    (status === 400 && /size|too large|maximum|payload|limit|exceed/i.test(raw)) ||
    /payload too large|maximum allowed size|object exceeded|file size exceeds|exceeded the maximum|entity too large|413/.test(
      text,
    );
  if (sizeLimit) {
    return `Supabase rejected this clip as larger than the project's file size limit. Confirm Storage → Settings → Global file size limit is ${limitLabel}, then retry.`;
  }

  const expiredSession =
    status === 401 ||
    /jwt expired|invalid jwt|invalid compact jws|not authenticated|session has expired|expired token|unauthorized.*jwt|sign in again/.test(
      text,
    );
  if (expiredSession) {
    return "Your session has expired. Sign in again and retry this clip.";
  }

  const permission =
    status === 403 ||
    /row-level security|rls|new row violates|not allowed|permission denied|unauthorized/.test(text);
  if (permission) {
    return "You don't have permission to upload this clip. Ask an admin if this keeps happening.";
  }

  const unsupportedType =
    status === 415 || /mime|content-type|not supported|unsupported.*type|invalid.*type/.test(text);
  if (unsupportedType) {
    return "This file type isn't supported. Use video, audio, image, or PDF.";
  }

  const interrupted =
    status === 0 ||
    /network|connection|timeout|timed out|offline|failed to fetch|load failed|econnreset|interrupted|networkerror|the network connection dropped|connection dropped/.test(
      text,
    );
  if (interrupted) {
    return "The upload was interrupted. Check your connection and retry this clip.";
  }

  if (raw.trim()) return raw;
  return "Upload failed.";
}

export interface UploadObjectBytesOptions {
  path: string;
  file: File;
  onProgress?: (fraction: number) => void;
  getAccessToken: () => Promise<string>;
  accessToken: string;
  supabaseUrl: string;
  anonKey: string;
  bucket: string;
  limitLabel: string;
  standardUpload: (path: string, file: File) => Promise<void>;
}

async function uploadWithTus(opts: UploadObjectBytesOptions): Promise<void> {
  const { path, file, onProgress, getAccessToken, supabaseUrl, anonKey, bucket, limitLabel } = opts;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableUploadEndpoint(supabaseUrl),
      retryDelays: [...TUS_RETRY_DELAYS],
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      /**
       * `onBeforeRequest` below is the only place that may set `Authorization`
       * and `apikey`. tus-js-client applies these static headers first and then
       * runs `onBeforeRequest`, and both go through `XMLHttpRequest.
       * setRequestHeader`, which *combines* a repeated header into
       * `"value1, value2"` instead of replacing it. Setting the token here as
       * well produced `Authorization: Bearer <jwt>, Bearer <jwt>`, which
       * Storage rejects as `Invalid Compact JWS`.
       */
      headers: {
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      fingerprint: () => Promise.resolve(`tus:${bucket}:${path}:${file.size}:${file.name}`),
      onBeforeRequest: async (req: HttpRequest) => {
        const token = await getAccessToken();
        req.setHeader("Authorization", `Bearer ${token}`);
        req.setHeader("apikey", anonKey);
      },
      onProgress: (bytesSent, bytesTotal) => {
        if (!onProgress || !bytesTotal) return;
        onProgress(Math.min(1, Math.max(0, bytesSent / bytesTotal)));
      },
      onError: (error) => {
        reject(new Error(describeUploadError(error, limitLabel)));
      },
      onSuccess: () => {
        onProgress?.(1);
        resolve();
      },
    });

    void upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads[0]) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch((error: unknown) => {
        reject(new Error(describeUploadError(error, limitLabel)));
      });
  });
}

async function uploadWithXhr(opts: UploadObjectBytesOptions): Promise<void> {
  const { path, file, onProgress, accessToken, supabaseUrl, anonKey, bucket, limitLabel } = opts;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      let message = `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        /* keep the status-code message */
      }
      reject(new Error(describeUploadError({ status: xhr.status, message }, limitLabel)));
    };
    xhr.onerror = () =>
      reject(new Error("The upload was interrupted. Check your connection and retry this clip."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

/**
 * Upload object bytes. Files larger than 6 MB use TUS against the direct
 * Storage hostname. Smaller files keep the existing XHR progress path, with a
 * supabase-js fallback when XHR is unavailable.
 */
export async function uploadObjectBytes(opts: UploadObjectBytesOptions): Promise<void> {
  if (opts.file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    await uploadWithTus(opts);
    return;
  }

  if (!opts.onProgress || typeof XMLHttpRequest === "undefined") {
    try {
      await opts.standardUpload(opts.path, opts.file);
    } catch (error) {
      throw new Error(describeUploadError(error, opts.limitLabel));
    }
    return;
  }

  await uploadWithXhr(opts);
}
