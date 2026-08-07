# Move "Log Interaction" out of the global header

Today the header shows a role-based primary CTA on every page (Log Interaction for anyone who can log, otherwise Submit Report / Add Goalkeeper). It should only appear where logging an interaction is actually relevant.

## What changes

**Header (`src/components/app-shell.tsx`)**
- Remove the persistent primary-action button from the header entirely.
- Header keeps: brand, role chip, theme toggle, notifications bell, Menu.
- Keep the "Log Interaction" action available in the slide-out menu drawer (for users with `interactions.log`), so it is never more than one tap away on mobile without cluttering the header.

**Pages that get the button (contextual placement)**
- Dashboard (`src/routes/index.tsx`) — CTA in the page header row, opens the Log Interaction dialog.
- Calendar (`src/routes/calendar.tsx`) — CTA next to the existing "Add event" control.
- Goalkeeper profile (`src/routes/goalkeepers.$gkId.tsx`) — already present, no change.
- Interactions Log (`src/routes/interactions.tsx`) — already present, no change.

Each CTA is gated on the `interactions.log` permission and uses the same `WorkflowDialog` with `kind="interaction"` that the header used, so behaviour is identical.

**Pages that lose it:** Match Reports, Media Library, Audit Log, Notification Centre, Executive, all System/* pages, Users & Roles, Player Records, Account.

## Technical notes

- Dashboard and Calendar each add local `useState<WorkflowKind | null>` plus a `<WorkflowDialog kind={workflow} onClose={...} />`, mirroring the pattern already in `interactions.tsx`.
- The `primaryAction` block and its `WorkflowKind`/`Plus` usage in `app-shell.tsx` are reduced to the drawer entry only.
- No backend, permission, or data changes — presentation only.
