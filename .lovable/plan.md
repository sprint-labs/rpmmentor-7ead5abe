# Rousey's five requests — status and completion plan

## Status against the current build

| # | Request | Status |
|---|---------|--------|
| 1 | Live Match Observation -> Match Report automation | Not built |
| 2 | Player club editing for David, Rich, Matt | Built, but only Super Admin can use it |
| 3 | Editing an existing interaction (e.g. Tom Watson date) | Not built |
| 4 | Interaction + voice note failing to save | Not confirmed fixed |
| 5 | Remove demo data | Mostly done, one test row remains |

What the code shows today:

1. Choosing "Live Match Observation" in the Log Interaction form just saves a normal interaction. There is no hand-off into the Match Report workflow and no automatic interaction record after a report is submitted.
2. A Player Record editor exists at Player Records -> a player, and it updates the club safely with a read-back check. It is behind the Super Admin-only navigation, and the database rule on the players table only lets Super Admin write. David, Rich and Matt cannot use it as things stand.
3. There is no update path for interactions anywhere — no edit screen, no server function, and the database currently blocks updates and deletes on interactions outright.
4. There is no separate save step for a voice recording inside the Log Interaction form: the microphone only pastes a transcript into Notes. Only one interaction exists in the database (a Toby Bell test entry), so the reported failure cannot be reproduced from data alone and needs diagnosis before a fix is claimed.
5. Demo interactions and demo reports were already emptied from the sample-data file, and the 113 players are the real roster. The one remaining interaction is a manual test entry ("Just testing if this actually saves").

## Plan to complete all five

### 1. Live Match Observation automation
- In the Log Interaction form, when the type is Live Match Observation, switch the dialog into the Match Report workflow, carrying over the selected goalkeeper, club and date.
- On successful Match Report submission, automatically write the matching interaction (type Live Match Observation, the report's date, goalkeeper and club, with the report reference in the notes) using the existing durable save path, so it appears in the log and in Duty of Care.
- Keep manual logging available for the other interaction types.

### 2. Player club editing for David, Rich and Matt
- Widen the write rule on players so Admin and Mentor Manager can also update the club, alongside Super Admin (database change, needs approval).
- Show Player Records in the navigation for those roles and allow the editor page to open for them.
- Add an inline "Update club" action on the goalkeeper profile for linked player records so it is reachable where the outdated club is actually seen.

### 3. Interaction editing
- Allow the author of an interaction, plus Mentor Manager / Admin / Super Admin, to update an existing interaction (database change, needs approval), with an audit-friendly updated timestamp.
- Add an Edit action in the interactions log and on the goalkeeper timeline, opening the same form pre-filled, with date correction supported.
- Save only after a confirmed read-back, and refresh the log, dashboard and timeline together. This covers the Tom Watson correction.

### 4. Fix interaction saving with a voice note
- Reproduce the flow end to end in the browser (record, transcribe, submit) and capture the exact failure from server logs before changing anything.
- Add a dedicated attachable voice note on the interaction form so a recording can be saved with the interaction rather than only pasted into Notes.
- Make the save resilient: a failing transcript or audio upload must never block the interaction itself, and any partial failure must show a clear message while keeping the typed content.
- Add regression coverage for "interaction with a voice note saves and survives a refresh".

### 5. Remove demo data and keep it out
- Delete the remaining test interaction row.
- Sweep the remaining sample-data helpers for anything still surfacing invented interactions, reports or metrics, and replace with empty states.
- Add a guard so sample records cannot be introduced through seeding on load or through server functions.

## Technical notes

- New/changed server functions: `updateInteraction` (owner + privileged roles), an interaction-write hook in the Match Report submit path, and a widened `updatePlayerClub` permission surface.
- Database migrations required for: `interactions` UPDATE policy, `players` UPDATE policy for admin/mentor_manager.
- Reuses the existing shared interactions query cache so edits and auto-created interactions refresh the log, dashboard and goalkeeper timeline together.
- Voice note fix starts with diagnosis (browser reproduction + server logs); no fix will be reported as done without a verified save-and-refresh check.
