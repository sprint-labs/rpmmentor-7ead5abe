-- Add one optional media attachment to broadcasts. Scheduling already uses
-- announcements.starts_at, which is now exposed by the composer UI.

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_attachment_consistency_check'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_attachment_consistency_check
      CHECK (
        (
          attachment_path IS NULL
          AND attachment_name IS NULL
          AND attachment_mime IS NULL
          AND attachment_size IS NULL
        )
        OR (
          attachment_path IS NOT NULL
          AND attachment_name IS NOT NULL
          AND attachment_mime IS NOT NULL
          AND attachment_size IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_attachment_path_scope_check'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_attachment_path_scope_check
      CHECK (
        attachment_path IS NULL
        OR (
          attachment_path LIKE 'announcements/%'
          AND char_length(attachment_path) <= 500
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_attachment_metadata_check'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_attachment_metadata_check
      CHECK (
        attachment_name IS NULL
        OR (
          char_length(attachment_name) BETWEEN 1 AND 255
          AND char_length(attachment_mime) BETWEEN 1 AND 150
          AND attachment_size BETWEEN 0 AND 26214400
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.announcements.attachment_path IS
  'Private gk-media object path for the optional broadcast attachment.';
COMMENT ON COLUMN public.announcements.attachment_name IS
  'Original display name for the optional broadcast attachment.';
COMMENT ON COLUMN public.announcements.attachment_mime IS
  'MIME type for the optional broadcast attachment.';
COMMENT ON COLUMN public.announcements.attachment_size IS
  'Attachment size in bytes. Limited to 25 MB by validation and constraint.';
