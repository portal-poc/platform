# ADR 0027: Legacy apps keep their identity provider — the BFF exchanges the portal token

## Context

A precedent in the real portal: bringing a legacy app in meant adapting both sides — the portal to the legacy app
(including its separate auth in the host) and the legacy app to the portal. The MF bridge already lets a legacy app keep its own
React and router (ADR 0002, `legacy-remote` runs React 18). What remained was identity.

## Decision

- **One login: the host's.** The legacy app asks the platform for a token for its BFF's audience
  (`platform.auth.getAccessToken(['api://legacy-bff/…'])`), allowed by its registry `scopes` like any remote.
- **The legacy BFF exchanges it server-side, on-behalf-of**, for a token of the legacy auth (validated portal token
  → legacy session, cached per user until it expires). The browser never talks to the legacy auth; the host never
  knows it exists.
- **The legacy frontend changes only at its edges**: a bridge entry (`RemoteBridge`), reading the platform contract,
  sending the portal token to its BFF. Its build stays its own (no shared singletons in bridge mode).
- PoC: `legacy-remote`'s fake legacy-bff validates the mock portal token (signature, expiry, scope) and returns the
  exchanged legacy session; the overview page shows it.

## Consequences

- No second sign-in and no second auth library in the host; logout and account switch in the host apply to the
  legacy app too (its next token is the new account's).
- Work moves to the backend: the legacy auth must accept the exchange (an app registration trusted for
  on-behalf-of, consent, a mapping portal user → legacy account). That is a one-time backend task per legacy system.
- The same model fits any remote whose backend needs a downstream identity.
