# Match participation

`calendar_events` keeps one row per goalkeeper associated with a fixture. That
association means the mentor is attending or observing a match involving the
goalkeeper; it is not proof that the goalkeeper played.

For `event_type = 'Match'`, `participation_status` is one of:

- `not_confirmed` — the safe default for manual, imported and historic rows;
- `played` — creates the normal Match Report requirement and 48-hour follow-up;
- `did_not_play` — retains the calendar association but creates no Match Report
  requirement.

Existing linked Match Reports remain completion evidence even when the historic
participation value is `not_confirmed`. The participation field is ignored for
Training Ground Visits, Coffee Catch-ups and retired event types, so their
Interaction and Duty of Care behaviour does not change.

## Future lineup-provider integration

A future provider belongs behind a server-only lineup adapter, after provider
fixture/player identities have been matched to a specific `calendar_events.id`
and `player_id`. The adapter should write the same `participation_status` field
used by the calendar control; it must not create a second follow-up model.

The adapter must:

1. map only authoritative lineup evidence to `played` or `did_not_play`;
2. leave ambiguous or unmatched players as `not_confirmed`;
3. use a service path with an explicit authorisation policy, never a browser
   write or a name-only match;
4. preserve the `participation_changed` audit record and provider provenance;
5. rely on the existing follow-up resolver to create or suppress the Match
   Report requirement.

No external lineup provider, credential, scheduled job or automatic identity
matching is included in this change.
