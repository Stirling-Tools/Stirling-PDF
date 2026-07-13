# Colour migration audit (temporary — remove before final merge)

Tracks colours that were **not** tokenized during the consolidation, and the semantic tokens still needed to finish the job. Generated from the agent consolidation pass.

## Needed new `--c-*` tokens (would let the flagged colours below migrate)

| Token | Value / role | Wanted by |
|---|---|---|
| `--c-warning` | amber status (mid) | Payg status chips, Procurement pending-step/projection, billing spend-projection |
| `--c-warning-subtle` / `--c-success-subtle` / `--c-danger-subtle` (+ `-border`) | pale status alert bg/border (3-step chip ramp: bg / text / dot) | auth error/success boxes, AuthCallback, Payg/billing status chips |
| `--c-neutral-*` accent family (fill / hover / text / border / tint) | low-emphasis grey *fill* button (the neutrals are surface/text/border only, no fill) | `core/ui/accents.css` `.sui-acc-neutral` |

## Genuinely-unique / fixed colours KEPT (with reasons)

**Brand**
- `#0a8bff` azure + rgba tints — cloud billing (`Payg`/`SpendCapControl`/`UpgradeModal`/`billing.css .scc`). Distinct from `--c-primary`.
- `#af3434` / `#9a2e2e` / `#9c2f30` Stirling red — `auth.css`, `saas-auth.css`.
- `#8e3131`… red family + AI multi-hue gradient (`#8b5cf6`/`#6366f1`/`#22d3ee`…) — `core/ui/accents.css`.
- `#16213e` navy — portal hero CTA text (fixed dark on white CTA).
- OAuth provider treatments (`#0f172a`, `#eef2f7`, provider button chrome) — `auth.css`.

**Data-viz / status (fixed by design)**
- Usage-bar / segment / dot gradients: `#0a8bff→#38bdf8`, `#8b5cf6`, `#06b6d4` — `billing.css`, `Payg.css`.
- Status-chip palette `#dcfce7`/`#fef3c7`/`#fee2e2` + dot rings — `billing.css`, `Payg.css` (marked "semantic, not theme-bound" in-file).
- Emerald `#10b981`/`#4ade80` (free tier), purple `#6c5ce7`, pink `#ec4899` — cloud billing.
- "viewed" teal/green `#10b981` / `--p-green-500` — `FilesPage.css`, `FileSidebarFileItem.css`.

**Illustration / bespoke**
- File-card navy header banner `#3b4b6e` (light) / `#0d1020` (dark) — `FileEditor.module.css`; adaptive but no "banner surface" token — decision needed (dedicated token vs fixed brand navy).
- Onboarding hero tiles/gradients (`#0f1626`, `linear-gradient(#eef1fb…)`) + pin gold `#ffc107` — `FileEditor`/`InitialOnboardingModal`.
- `.portal-qb*` Notion light-only paper palette (`#37352f`, `#e3e1dc`, `#2383e2`…) — `Procurement.css`.
- QR/logo whites, Calendly white — various (must stay).

**Per-theme, no token (OS-media / rgb-triplet contexts)**
- `AuthCallback.module.css` `@media (prefers-color-scheme: dark)` block — `--c-*` follow the *app* theme not the OS query, so can't use them here.
- `auth-theme.css` `--text-divider-*-rgb` navy triplets (consumed as `rgb(var(--x)/.4)`).

**Structural** (allowed anywhere): `rgba(0,0,0,…)` / `rgba(255,255,255,…)` scrims/shadows/hovers; pure black/white; the deliberate flash-yellow animation.
