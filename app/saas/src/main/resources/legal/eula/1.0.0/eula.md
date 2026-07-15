# Stirling EULA & Commercial Terms

This document fills the EULA slot the website Terms of Service §5 already contemplates ("If a separate end-user license (EULA) accompanies software, that license governs to the extent of any conflict"). It carries the commercial terms of the actual product: the PDF Process meter, spend limits, prepaid capacity, the free allotment, trials, self-hosted licensing, and AI features. For customers under a signed Stirling Enterprise Agreement, that agreement controls.

**Effective:** {{version_date}} · **Version:** {{version}}

## 1. Agreement; precedence

These EULA & Commercial Terms ("EULA") supplement the Stirling Terms of Service (stirling.com/legal/terms-of-service). If they conflict, this EULA controls for the software and the commercial terms below. Open-source components are governed by their own licenses, which control for those components. By clicking accept, creating a workspace, or using the software, you agree on behalf of yourself and, if applicable, the organization you represent ("you").

## 2. The products

**The Stirling PDF Editor** is free: manual editing, the tool catalog, and team administration (including SSO) carry no subscription fee or per-seat charge, whether used in the browser, as a desktop application, or self-hosted. Usage limits on automated processing, fair-use rules (Section 11), support levels, and the feature set may change over time, and third-party costs (such as your own hosting) are yours. The Editor's open-source components remain available under their own licenses independently of this EULA. **The Stirling PDF Processor** is the paid platform that processes PDFs automatically — policies, pipelines, the Stirling Agent, and API processing — billed on the meter below.

## 3. Definitions

**"PDF Process"** — one policy execution, one pipeline run (regardless of the number of operations in its chain), or one Stirling Agent returned artifact (a processed file or summary, regardless of the number of messages that produced it), applied to one file. **"Data Processing"** — the data-volume component of the meter: files carry their first 25 MB included per file; volume past that is billed per Section 4. **"file"** — a document processed by the Processor. Chatting with the Stirling Agent is free; only returned artifacts meter.

## 4. Metered billing (pay as you go)

4.1 **Rates.** 1¢ per PDF Process, plus Data Processing at 1¢ per 25 MB increment past the first 25 MB of each file. Megabytes are decimal (1 MB = 1,000,000 bytes); size is measured once per file as submitted; increments round up ("part thereof" counts — a 26 MB file incurs one Data Processing increment, a 60 MB file incurs two). Rates may change on thirty (30) days' notice; changes apply prospectively. **Example:** two policies on a 3 MB contract = 2¢; two policies on a 60 MB scan set = 2¢ + 2¢ data = 4¢.

4.2 **Free allotment.** New workspaces receive a one-time allotment of 500 PDF Processes. A file processed by two processes consumes two of the 500. When the allotment is exhausted, processing pauses until the Processor is switched on.

4.3 **Invoices.** Usage is invoiced monthly on the 1st for the prior cycle, charged to your payment method on file (card or ACH debit). You authorize these charges.

4.4 **Usage records.** The Processor's audit log is the system of record, subject to Section 4.5. Your Usage & Billing page shows consumption, and a per-file usage statement (name, size, processes, charge) is available for download.

4.5 **Billing disputes.** You may dispute a charge or metering record in good faith within sixty (60) days of the invoice or charge date. We will investigate, provide the relevant usage-statement detail, and correct confirmed errors by credit or refund. The audit log is presumptively accurate but not conclusive; reasonable contrary evidence will be considered. Undisputed amounts remain payable.

## 5. Spend limits

5.1 You may set a monthly spend limit. By default, processing pauses when usage reaches the limit; queued documents resume when you raise the limit or the cycle resets. Nothing already processed is lost.

5.2 If you enable **keep-processing** ("Keep processing if you hit your limit"), usage past the limit continues to accrue and be billed per Section 4; the limit then functions as a notification threshold. You can change the limit or the toggle at any time in Usage & Billing.

## 6. Cancellation; downgrade

You may revert to the free Editor plan at any time from Usage & Billing. Accrued usage remains payable. Your policies, configuration, and history are retained per the Terms of Service data-retention practices.

## 7. Prepaid capacity (self-serve annual)

7.1 **Offer.** You may prepay twelve (12) months of processing capacity for the price of ten (10) (the "12-for-10 rate"), sized at purchase. Payment by card, or by bank transfer against a generated invoice (net 30); prepaid capacity activates when payment clears.

7.2 **No renewal of prepaid capacity; automatic transition to pay-as-you-go.** Prepaid capacity does not renew for another prepaid term. At purchase, you affirmatively consent to the following transition, which is disclosed before you pay: when the term ends, metered billing (Section 4) applies automatically at then-current rates so processing does not pause. We remind you thirty (30) days before term end; the reminder states the metered rates that will apply and how to cancel or revert to the free Editor plan (one click in Usage & Billing).

7.3 **Consumption; overage; expiry.** Capacity draws down in PDF Processes. If you exhaust capacity mid-term, you may top up at the same 12-for-10 rate, or metered billing applies at list rates (with a card on file) or processing pauses (without one). Unused capacity expires at term end and is not refunded and does not roll over.

7.4 **Cap.** Self-serve prepaid capacity is limited to 1,000,000 PDF Processes per year; larger commitments are available under a Stirling Enterprise Agreement.

## 8. AI features

AI features — classification, extraction, redaction-assist, and the Stirling Agent — are optional. They run only when you invoke a feature that uses them, and an administrator can disable them for the workspace; the rest of the Processor works without them. When used, they call machine-learning models from the providers listed at {{subprocessor_url}}. Currently: **Anthropic** (Claude models), which receives prompts and the document text or excerpts needed to perform the requested task; and **Voyage AI** (embedding models), which receives extracted text excerpts solely to generate embeddings when you enable Ingestion/RAG features. Only the document text or excerpts needed for the requested feature are sent — not your whole files — and only when that feature runs. AI charges are included in the price of whatever runs — there is no separate AI surcharge. Your content is not used to train models, by us or by these providers (verified against our signed provider agreements). AI outputs are probabilistic; review outputs before relying on them where accuracy has legal effect.

## 9. Evaluations and trials

Enterprise trials run fourteen (14) days, require no payment method, and are provided for evaluation only, AS IS, without service level commitments. Either party may end an evaluation at any time; on expiry your workspace continues on the free Editor plan.

## 10. Self-hosted and desktop software

10.1 **License.** We grant you a non-exclusive, non-transferable license to install and run the Editor and, with an active plan, the self-hosted Processor, for your internal business use. Open-source components remain under their own licenses.

10.2 **License validation and metering.** Self-hosted Processor deployments validate their license online and transmit usage metering data (process counts, file sizes, and file hashes for billing integrity, and diagnostic data — never file content or file names) to Stirling. File names used for unique PDF identification remain on your server and are not transmitted. Air-gapped deployments verify a signed activation bundle offline and reconcile usage periodically. You will not disable, circumvent, or falsify validation or metering. **The meter is the same regardless of where the software runs.**

10.3 **Updates.** Security patches and upgrades are made available for supported versions; some updates may install automatically per Terms of Service §5.

10.4 **Authorized users and administration.** "Authorized Users" are your employees, and the employees of your affiliates and contractors working on your behalf, whom you provision through your workspace. You are responsible for your users' credentials, your administrators' actions, and your users' compliance with this EULA. One workspace serves one legal entity and its affiliates; serving unrelated third parties requires a separate agreement. You may not redistribute the Processor or offer it as a hosted service to others. On termination or downgrade, self-hosted Processor licenses expire per the license mechanism; installed Editor copies remain usable under the free plan. We may verify license compliance through the validation mechanism in Section 10.2.

## 11. Fair use

Free-tier and flat-price features are subject to fair use: we may throttle or decline usage patterns that abuse free processing (for example, automation disguised as manual editing) after notice where practicable.

## 12. Changes to this EULA

We may update this EULA. Material changes take effect thirty (30) days after notice. Changes that materially increase your price or reduce your rights take effect at your next billing cycle or prepaid term start, or upon your affirmative acceptance — whichever comes first — except changes strictly necessary for legal compliance or security, which may take effect sooner with notice. Continued use after the effective date is acceptance. Version history is available at {{eula_url}}.
