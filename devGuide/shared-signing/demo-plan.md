# Customer demo plan

24 September 2026 | local patch based on `910b5d012f`

Demonstrate a single Sign entry, fast request creation and a verifiable final PDF. Use the patched registered-user/uploaded-certificate workflow. Production approval still requires the deployment gates in the [closure report](./blocking-work-report.md).

## Fifteen-minute demonstration

| Time | Presenter action | What to establish |
|---|---|---|
| 0–2 min | Open the non-binding two-page PDF. Click **Sign** in the permanent rail. Show personal draw/type/upload, certificate signing, request creation and sessions. | One entry point; personal editors currently remain separate. |
| 2–4 min | Choose **Request signatures**. Show the carried-over PDF, select Alice and Bob, point out their names. Optionally enable the summary, then Send. | One compact form. People may sign in any order; owner finalization produces the final PDF. |
| 4–7 min | Alice opens **Sign > Signing sessions**, reviews, types and places a mark on page one. Complete & Sign, upload her synthetic PKCS12, check the subject and submit. | Optional marks, readable typed appearance, certificate identity and Submitted—awaiting finalization. Viewed records access, not proof of reading. |
| 7–9 min | Bob opens the request and selects **Complete & Sign** without placing a mark. Upload his certificate and submit. | Certificate-only contributions; owner progress reaches 2/2. |
| 9–12 min | Owner finalizes once and downloads. Run **Validate PDF Signature**; inspect the summary and visible mark. | Exactly two valid digital signatures and distinct subjects. Self-signed demo certificates establish integrity, not automatic recipient trust. |
| 12–14 min | Show a prepared partially signed request and named early-finalization warning, then Cancel. Show Mine + Overdue and a Completed request. | Minimum one signature, explicit exclusion of outstanding people, advisory dates and closure. Submitted and finalized differ. |
| 14–15 min | Share the guide and self-host checklist; agree pilot acceptance. | Clear deployment and certificate/trust requirements. |

With one PDF already selected, the default one-person request uses five primary pointer actions: Sign, Request signatures, participant picker, select signer, Send. Search, extra signers and optional settings add interactions. Show the short path first.

## Rehearsal preparation

1. Pin the patched build and rehearse in clean, separate owner/Alice/Bob browser profiles. The local review switched ordinary accounts in one profile; separate presentation profiles prevent shared authentication/document history.
2. Use only `demo-fixtures/Shared-signing-demo.pdf`, explicitly synthetic/non-binding. Check the distinct test certificates have not expired. Keep passwords out of screenshots and customer handouts.
3. Coordinator: `demo.observer`; signers: `demo.alice` and `demo.bob`. Use ordinary accounts for the presentation.
4. Prepare a fresh request, partial request, declined request and independently verified completed example. Never label an unsigned PDF as completed evidence.
5. Use uploaded certificates unless a legitimate licensed managed-certificate installation has passed its own acceptance run. Avoid configuration changes during the meeting.
6. Rehearse downloads, the intended HTTPS/reverse-proxy address and the customer's PDF reader. Confirm persistence of database, blobs and keys.
7. Keep unrelated documents/notifications out of the presentation environment. If a step fails, show the failure honestly and use a clearly labelled, pre-validated example as fallback.

## Claim boundaries

Locally verified scope covers registered users, PKCS12/PFX/JKS/PEM uploads, optional marks, progress/decline, owner finalization and retrieval. Invalid creation, certificate and mark inputs are rejected before accepting work. Access/lifecycle checks and independent signature verification support the demonstration.

The popover links to the full session list; it does not yet embed recent sessions. Wet/certificate personal editors remain separate. See the [history and next steps](./sign-experience-history.md).

Do not promise guest onboarding, email invitations/reminders, enforced signing order, multiple-document envelopes, qualified signatures or universal recipient trust. SMTP alone does not implement those journeys. Legitimate paid/provider paths, SSO, restore, supported devices and the customer's deployment need separate acceptance.

## Customer decisions

Confirm participants/accounts, certificate authority and PDF reader, retention/recovery requirements, and whether external invitations, reminders or signing order are required. Define a two-signer final-artifact test and a recovery test for the pilot.
