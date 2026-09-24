# User-story closure assessment

24 September 2026 | local patch based on `910b5d012f`

**4.3/5 overall: 52/60 across 12 equally weighted stories**, versus 3.7/5 after the first repair batch and 2.4/5 initially. Ratings are review judgments within the tested scope; untested deployments are not counted as passes. A high mean cannot override a release gate.

Scale: 5 = acceptance met in the tested scope; 4 = works with a limited caveat; 3 = usable with material friction; 2 = important acceptance fails; 1 = core outcome fails.

| ID | User story | Previous → now | Evidence and remaining friction |
|---|---|---|---|
| S01 | Administrator enables the right signing capability and edition. | 4 → **4** | Login/local storage/uploaded signing work without a paid license; unlicensed managed submissions are denied. Template scope corrected. Legitimate paid/provider combinations await an appropriate installation. |
| S02 | Owner sends one valid PDF to named colleagues with few clicks. | 3 → **5** | Permanent Sign menu, one form, carried-over PDF and named people. Empty/duplicate users, aliases, concurrent duplicate additions and non-PDF/protected creation rejected. Multi-document requests are outside the story. |
| S03 | Signer finds, reviews and accesses only their intended request. | 4 → **4** | Polled sessions, Viewed, permissions and final state work. Submitted now stays Active; Completed means finalized. Session cards are keyboard buttons. No recent-session feed inside the popover yet. |
| S04 | Signer uses a certificate and corrects errors without losing work. | 3 → **4** | Four uploaded formats; PEM preflight; invalid/pending/stale validation cannot submit. Wrong-password UI correction succeeds with readable feedback. Customer CA/trust and managed certificates remain unverified. |
| S05 | Signer uses editable marks or certificate-only signing. | 3 → **4** | Zero-mark browser submission verifies; typed image cropping improves legibility. Multi-page marks and four cropped/rotated rendering cases pass. Arbitrary image whitespace and mobile/touch ergonomics still need coverage. |
| S06 | Signer submits or declines once with a reliable outcome. | 4 → **4** | Fresh duplicate/repeat/late/invalid-input checks preserve state; submission outcome is explicit. Decline still acts immediately and has no reason capture/undo. |
| S07 | Owner sees progress, outstanding people and advisory dates. | 3 → **4** | Progress and status maintained; Mine + Overdue now shows owned past-due sessions in the browser. No automatic reminders or enforced ordering is promised. |
| S08 | Owner manages unique participants and preserves closed history. | 3 → **5** | Duplicate invitation gap closed atomically, including aliases/concurrency. Removal/re-add/access revocation checks pass. Finalized participant/history mutations remain refused. |
| S09 | Final PDF contains every accepted contribution with correct evidence. | 4 → **5** | Mixed-format distinct identities, independently valid CMS signatures, tamper detection, summary on/off and marks pass. Invalid raw text/images/pages/geometry are rejected before SIGNED instead of breaking finalization. |
| S10 | Owner knowingly closes early with at least one signature. | 5 → **5** | Minimum one, named include/exclude confirmation, Cancel, closed views and late-action rejection remain covered; concurrent finalization publishes once. |
| S11 | Parties retrieve durable final output and understand it. | 4 → **4** | Eight fresh final artifacts survive restart unchanged; original retained; pending contribution finishes after restart. Correct Active/Completed classification. Backup restoration and recipient trust remain deployment gates. |
| S12 | Administrator relies on permissions, secrets and persistence. | 4 → **4** | Fresh auth/token role/expiry checks; audit shows encrypted pending credentials and no finalized signing payloads. Paid/provider/cluster/restore coverage and retention policy still required. |

[Closure report](./blocking-work-report.md): 129/129 fresh ledger checks and 302 workflow tests pass. Full frontend checks pass 5,803/5,805 tests; six backend and two frontend failures are known unchanged-HEAD failures. Broad gates remain red. No new regression was found in exercised paths.

The previous scorecard (retained in the local review evidence) and original baseline (retained in the local review evidence) remain historical evidence. See [Sign history](./sign-experience-history.md) for the original concept and the next steps toward one unified personal/shared tool.
