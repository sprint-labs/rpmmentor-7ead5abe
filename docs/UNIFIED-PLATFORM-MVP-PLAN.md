# GKHQ unified platform MVP plan

Status: implementation plan for the approved first slice  
Date: 29 August 2026  
Target: Mentor Hub `dev` after local verification and release approval

## Outcome

Create one role-aware GKHQ front door for Mentor, Scouting and Bulletin work without prematurely merging their repositories, Supabase projects or permission models.

The first release keeps Mentor Hub and GKHQ Scouting independently deployable. It adds a consistent workspace switcher, verifies the Bulletin migration and manager workflow against the target environment, and defines a safe cross-product handoff contract. The separately hosted prototype demonstrates the complete Club Need to recommendation journey before the cross-product data integration exists.

## Product structure

- Home: role-aware work requiring attention across permitted workspaces.
- Mentor: goalkeeper relationships, interactions, reports, calendar and media.
- Scouting: goalkeeper search, profiles, shortlists and recommendations.
- Bulletin: daily updates, club needs or deals, leads and mandates.
- Admin: people, permissions, integrations, data quality and audit; permission-gated.

Global navigation contains only these workspace choices. Each workspace owns its contextual secondary navigation so the existing long flat route list does not become the platform information architecture.

## Visual contract

The supplied Mentor Hub dark and light screenshots are the operational source of truth. The Claude reference contributes editorial restraint rather than a separate component system.

- Work Sans for interface text, JetBrains Mono for labels, dates and counts.
- Warm off-white and graphite surfaces with thin borders and almost no shadow.
- Green for primary actions and success, amber for attention, blue for informational or Scouting states, red for critical states.
- Dense master-detail workbenches for Interactions, Match Reports, Scouting and Bulletin.
- Dark default with complete light-mode parity.
- Minimum 44 px mobile targets, visible focus styles and no colour-only status meaning.

## Data policy

Production surfaces must call the existing authenticated server functions and remain protected by each product's local authorisation and RLS.

The public prototype must not expose either product's private Supabase data or credentials. Where authenticated data is unavailable, it uses only reference records already present in supplied screens or existing prototype fixtures, labels them as prototype data, and keeps the persistence client-side.

No product JWT, service-role key or private database client crosses into the other product or into the public prototype.

## Integration seam

The initial seam is framework-neutral and URL-based:

- Stable product identifiers and canonical base URLs.
- Neutral capability names mapped to each product's local roles.
- Shared visual tokens and workspace metadata.
- Ordinary HTTPS navigation between products.
- A future short-lived opaque handoff for Scouting entry points; sensitive requirements do not belong in query strings.
- A future external-identity mapping table for player IDs and mandate IDs.

The first deep-link contract is:

```text
Bulletin club need
  -> short-lived opaque handoff
  -> GKHQ /goalkeepers with server-validated filters
  -> goalkeeper profile
  -> recommendation brief
  -> return URL to the originating Bulletin item
```

Until a verified ID mapping exists, links must not claim that a Mentor `players.id` is the same entity as a GKHQ goalkeeper ID.

## Delivery phases

### Phase 1 - clickable product proof

- Unified Home, Mentor, Scouting and Bulletin workspaces.
- Working dark/light switcher, navigation, filters, search, selection and dialogs.
- End-to-end Club Need to Search to Recommendation to Bulletin journey.
- Desktop and mobile browser verification.
- Screenshot comparison against the supplied visual references.

### Phase 2 - Mentor production slice

- Workspace switcher integrated into the existing permission-aware shell.
- Existing Mentor routes grouped contextually without removing direct URLs.
- Scouting opens through a canonical, configurable external URL.
- Bulletin schema, grants, policies and authenticated manager workflow verified before any speculative code change.
- Existing real-data server functions retained; no new mock production data.

### Phase 3 - cross-product identity and sign-in

- Reconcile and publish the GKHQ four-role branch.
- Verify both live schemas, RLS policies and deployment targets.
- Configure the same external identity provider in both products while retaining product-local memberships.
- Introduce explicit player and mandate mappings through a narrow service or BFF.
- Add return links and recommendation summaries only after capability and data-leakage tests pass.

## Acceptance gates

- The core prototype journey is fully clickable and keyboard operable.
- Dark and light modes pass visual QA at desktop and mobile widths.
- Production code uses real server-backed data where a contract exists.
- Prototype-only data is visibly identified.
- Bulletin pgTAP and authenticated manager edit checks cover the database column grant and optimistic versioning.
- Existing focused tests, lint, type-check and production build pass.
- No unresolved P0, P1 or P2 visual-QA findings.
- No deployment, migration or `dev` push occurs until its exact validated scope is reviewed.

## Explicit non-goals for this slice

- Monorepo or database consolidation.
- Iframes or root-path proxying of one application through the other.
- Shared JWTs or browser-side service-role clients.
- Automatic player matching based on names.
- Applying GKHQ migrations from the current dirty checkout.
