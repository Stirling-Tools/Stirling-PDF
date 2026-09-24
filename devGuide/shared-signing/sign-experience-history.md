# Restoring the Sign experience

24 September 2026 | repository history and the local patch based on `910b5d012f`

Your recollection is supported by the code history. Sign previously had a central popover, and your later work explicitly combined personal wet and certificate signing.

| Commit | Author/date | Evidence |
|---|---|---|
| `ff9c6917fef6820a593593c555914c6e7dc406b5` | Connor Yoh, 27 January 2026 | “Working signing” adds `frontend/src/core/components/shared/signing/SignPopout.tsx` and the wider signing implementation. |
| `5f87f4eea5` | ConnorYoh, 6 February 2026 | “Shared Signing on top of FileShare (#5579)” contains the shared-signing/popover work in the integrated history. |
| `2f28917be8` | Connor Yoh, 24 March 2026 | “Add sorting, search, and filter chips to sign popout” demonstrates that finding sessions was part of the popover concept. |
| `a6510615549330c6bb2ea3be74a3b87c7463a6e9` | Connor Yoh, 27 March 2026 | “feat(sign): merge cert-sign and wet-sign into a unified Sign tool” adds CombinedSign/CombinedSignEditor, a wet/certificate/both selector and a shared operation hook. This commit is not an ancestor of the current checkout; it proves the implementation existed, not that this exact revision shipped. |
| `7ab30d2629` | EthanHealy01, 30 June 2026 | “add file share to the top workbench bar and add shared signing (#6715)” deletes the editor's SignPopout file. |
| `613402c8c3e5416c4050aa86d74bf6e0e2071c0a` | Reece, 20 August 2026 | The quick navigation rail explicitly chose Shared Signing over Sign because its polled count justified a permanent slot. This explains the current split. |
| `ead8a536d2` | ConnorYoh, 29 August 2026 | TanStack Query session fetching/polling work is preserved by the patch. |

The original January commit also is not a direct ancestor of current HEAD. Squashed/integrated history and historical branch work must not be confused with proof that an individual commit shipped. These findings come from `git show`, path history and ancestry checks, not commit titles alone.

## Implemented now

- Permanent **Sign** entry in the global navigation rail, carrying the outstanding signing badge.
- A provider-independent popover with **Draw, type or upload a signature**, **Sign with a certificate**, **Request signatures**, and **Signing sessions**. Personal signing remains available when shared signing is unavailable; unavailable choices explain why.
- Direct request creation using the currently selected PDF. Participants and their names are visible on one form; due date and appearance/summary settings are optional. No four-step wizard for the default path.
- Explicit submitted-versus-finalized status, owned overdue filtering, optional visible marks, and certificate validation that prevents invalid or stale submissions.
- Keyboard menu navigation and focus handling without depending on either editor or processor providers.

With a PDF already selected, the default one-person request takes five primary pointer actions: Sign, Request signatures, open the participant picker, choose a person, Send. Typing/searching for a person may add interaction. Adding more signers adds one selection each. This is a controlled happy-path interaction count, not a usability timing study.

## Next steps toward the full vision

1. Put a short recent/pending session list inside the popover, reusing the existing query cache and poller. Retain a full-session-list destination for search and larger histories. The present patch links to the list; it does not yet embed session cards in the popover.
2. Port the useful behavior from the March CombinedSign work into the current editor architecture. Offer personal wet/certificate/both in one document editor and reuse the certificate configuration/validation seam. Do not wholesale cherry-pick the old UI against today's file and navigation architecture.
3. Make “request signatures on this document” a contextual action from that same editor, retaining the current PDF and unsaved-change protection. Keep request creation compact; progressive disclosure should contain optional settings.

Guest onboarding, email delivery/reminders, enforced order, multi-document envelopes and production trust validation are separate product/deployment work. A central Sign menu does not establish any of them.
