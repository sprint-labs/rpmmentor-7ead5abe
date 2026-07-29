import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Sparkles, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { transcribeNotes } from "@/lib/api/transcribe.functions";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB upload cap for the gateway

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

interface Props {
  context?: string;
  onTranscribed: (text: string, mode: "replace" | "append") => void;
  /** Match Report comments are never replaced — hide the replace action. */
  allowReplace?: boolean;
  className?: string;
}

export function HandwrittenNotesField({ context, onTranscribed, allowReplace = true, className }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const run = useServerFn(transcribeNotes);

  const reset = () => { setPreview(null); setTranscript(null); };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error("Please choose an image file."); return; }
    if (file.size > MAX_BYTES) { toast.error("Image is too large (max 8MB)."); return; }
    try {
      const url = await readAsDataUrl(file);
      setPreview(url);
      setTranscript(null);
      setBusy(true);
      const result = await run({ data: { imageDataUrl: url, context } });
      if (!result.ok) {
        toast.error(result.error);
        setTranscript(null);
      } else {
        setTranscript(result.text);
        toast.success("Notes transcribed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-md border border-dashed border-border bg-accent/10 p-3 space-y-3 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />Transcribe Handwritten Notes
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Snap or upload a clear photo of your notes — AI will turn it into typed text you can drop into the notes field.</p>
        </div>
        {(preview || transcript) && (
          <button type="button" onClick={reset} className="size-7 grid place-items-center rounded-md hover:bg-accent text-muted-foreground" aria-label="Reset"><X className="size-3.5" /></button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      {!preview && !busy && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
            <Camera className="size-3.5" />Take photo
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-accent">
            Upload image
          </button>
        </div>
      )}

      {preview && (
        <div className="flex gap-3">
          <img src={preview} alt="Handwritten notes preview" className="h-24 w-24 rounded-md object-cover border border-border shrink-0" />
          <div className="flex-1 min-w-0">
            {busy ? (
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Transcribing…</div>
            ) : transcript ? (
              <>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
                <div className="text-xs whitespace-pre-wrap bg-background border border-border rounded-md p-2 max-h-40 overflow-y-auto">{transcript}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button type="button" onClick={() => onTranscribed(transcript, "append")} className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90">
                    Append to notes
                  </button>
                  {allowReplace && (
                    <button type="button" onClick={() => onTranscribed(transcript, "replace")} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent">
                      Replace notes
                    </button>
                  )}
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(transcript); toast.success("Copied"); }} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent">
                    Copy
                  </button>
                  <button type="button" onClick={() => { setTranscript(null); setBusy(true); run({ data: { imageDataUrl: preview, context } }).then((r) => { if (r.ok) { setTranscript(r.text); } else { toast.error(r.error); } }).finally(() => setBusy(false)); }} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent">
                    <RotateCcw className="size-3" />Retry
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
