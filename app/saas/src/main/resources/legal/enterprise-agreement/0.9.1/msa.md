# Stirling Enterprise Agreement

One signature executes all three parts of this Agreement: the Master Services Agreement (Part A), the Order Form (Part B), and the Data Processing Addendum (Part C). The Stirling EULA & Commercial Terms is incorporated by reference to the extent stated in Section 9.1.

## Part A — Master Services Agreement

This Master Services Agreement (the "Agreement") is entered into as of {{effective_date}} (the "Effective Date") by and between **Stirling PDF, Inc.**, a Delaware corporation with offices at 548 Market Street PMB 887643, San Francisco, CA 94104 ("Provider"), and **{{customer_legal_name}}** ("Customer"). Each a "Party," together the "Parties."

### 1. Services & License

1.1 **The Services.** Provider will provide the Stirling PDF Processor (the "Processor") — the hosted or customer-deployed platform for distributing PDF editors and governing PDF processing, including policies, pipelines, the Stirling Agent, API access, and the administrative console — and the Stirling PDF Editor (the "Editor"), as described in the Order Form.

1.2 **License grants.** Provider grants Customer, for the Term: (a) a non-exclusive, non-transferable right to access and use the Processor for Customer's internal business operations, up to the Committed Volume; and (b) a non-exclusive right to deploy and distribute the Editor to Customer's authorized users without limit on user count. Open-source components of the Editor remain governed by their own licenses, which control for those components.

1.3 **Deployment.** The Services are delivered via the deployment stated in the Order Form (Stirling Cloud, Self-hosted, or Air-gapped). Self-hosted deployments validate their license and report metering data online; Air-gapped deployments verify a signed activation bundle offline and reconcile usage periodically as described in the Documentation. Customer shall not disable, circumvent, or falsify license validation or usage metering. The metered rate does not vary by deployment; deployment-specific services are priced as line items in the Order Form.

1.4 **Restrictions.** Customer shall not: resell or provide the Services to third parties as a service bureau; reverse engineer non-open-source components; use the Services to violate law; or exceed the scope of the Order Form other than through Overage (Section 3.4).

### 2. Term & Renewal

2.1 **Initial Term.** {{term_years}} year(s) from the Effective Date.

2.2 **Renewal.** The Agreement auto-renews for successive periods equal to the Initial Term unless either Party gives sixty (60) days' written notice of non-renewal before the end of the then-current term. The Annual Fee for each renewal year equals the immediately preceding year's Annual Fee increased by three percent (3%) — the same formula as Section 2.3. Itemized services escalate at the same rate unless restated in a superseding Order Form.

2.3 **In-term escalator.** The Annual Fee (including itemized services) increases by a fixed three percent (3%) at each anniversary of the Effective Date during the Term.

### 3. Fees & Payment

3.1 **Annual Fee.** Customer shall pay the Annual Fee stated in the Order Form, calculated as the Committed Volume ({{committed_pdfs_yr}} PDFs per year) at {{rate_per_pdf}} per PDF at the {{posture}} governance posture, plus the itemized services in the Order Form, less the term discount stated there.

3.2 **Invoicing.** Fees are invoiced annually in advance, due net thirty (30) days. Late amounts accrue interest at 1.5% per month or the maximum permitted by law, whichever is less. Fees are exclusive of taxes; Customer is responsible for all taxes other than Provider's income taxes.

3.3 **Committed Volume; measurement.** The Committed Volume is denominated in PDFs processed per year at the stated posture, and converts to a drawdown allowance in PDF Processes at the fixed conversion schedule below, which is frozen for the Term:

| Posture | PDF Processes per PDF |
| --- | --- |
| Essentials | 2 |
| Governed | 4 |
| Regulated | 7 |

A **"PDF Process"** is one policy execution, one pipeline run, or one Stirling Agent returned artifact, applied to one file, plus Data Processing increments under Section 3.5. For clarity: a pipeline run counts as one PDF Process regardless of the number of operations in its chain; a Stirling Agent artifact counts as one regardless of the number of messages that produced it; failed processes (those that do not complete) are not counted; reprocessing the same file and duplicate submissions are counted; counts are whole numbers (no rounding). The Processor's audit log records each PDF Process and is the system of record, subject to Section 3.7. Provider will make a per-file usage statement (file identifier, size, processes, drawdown) available for audit.

**Worked example.** At the Governed posture, a commitment of 90,000,000 PDFs/year provides a drawdown allowance of 360,000,000 PDF Processes. A 60 MB file that runs the four Governed policies draws down 4 PDF Processes plus 2 Data Processing increments (Section 3.5) = 6 PDF Processes. The allowance is a purchased quantity, not a feature limit: Customer may run any number of policies or pipelines; actual consumption simply draws the allowance down faster, and consumption beyond it bills as Overage (Section 3.4).

3.4 **Overage.** Consumption beyond the Committed Volume in a contract year is billed quarterly in arrears at the committed rate stated in the Order Form. Overage does not increase subsequent years' Committed Volume.

3.5 **Data Processing.** Each file includes its first twenty-five (25) megabytes (decimal, 1 MB = 1,000,000 bytes) at no additional drawdown. Each additional twenty-five (25) megabytes or part thereof (rounded up per file) draws down one (1) additional PDF Process. File size is measured once per file at ingestion, on the file as submitted. This schedule is stated here in full, is frozen for the Term, and is not subject to alteration through the Documentation.

3.6 **No refunds.** Except as expressly stated (Sections 7.1, 7.3, 10.3, and DPA Section C5), fees are non-refundable and Committed Volume does not roll over between contract years.

3.7 **Billing disputes.** Customer may dispute any invoice or metering record in good faith within sixty (60) days of the invoice date. Provider will investigate promptly, provide the relevant audit-log extracts and usage statements, and correct confirmed errors by credit or refund. The audit log is presumptively accurate but not conclusive; Customer may rebut it with reasonable evidence. Undisputed amounts remain payable when due.

### 4. Data Protection

4.1 The Data Processing Addendum at Part C (the "DPA") is incorporated into this Agreement and governs Provider's processing of Customer Personal Data, in compliance with the GDPR, UK GDPR, and CCPA/CPRA to the extent applicable.

4.2 **Zero-standing-access.** Customer file content is encrypted in transit and at rest. Provider personnel have no standing access to Customer file content; access is granted just-in-time under audited elevation, solely as necessary to provide the Services or as instructed by Customer. Document metadata is maintained to operate the governed record. Where the Order Form includes BYOK or HYOK key management, the key terms in the Documentation apply.

### 5. Security & Availability

5.1 **Security program.** Provider maintains a written information security program including access controls, encryption (TLS 1.2+ in transit, AES-256 at rest), audit logging, vulnerability management, and personnel security. Provider will provide its available security documentation (including its security program overview and penetration-test attestation) upon request under confidentiality.

5.2 **Availability.** For Stirling Cloud deployments, Provider targets 99.9% monthly uptime, excluding scheduled maintenance announced at least 48 hours in advance. The uptime figure is a target, not a credited commitment, and no service credits apply. Support response commitments for the {{sla_tier}} tier are set out in the SLA Exhibit referenced by the Order Form.

5.3 **Breach notice.** Provider will notify Customer without undue delay after becoming aware of a Personal Data Breach affecting Customer Personal Data, and in any event within forty-eight (48) hours of awareness. Provider may provide information in phases as it becomes available and will supplement its notice as investigation proceeds.

5.4 **Updates.** Provider will make security patches and product upgrades available to Customer at no additional charge for supported versions.

### 6. Confidentiality

6.1 Each Party shall protect the other's Confidential Information with at least the care it uses for its own similar information and no less than reasonable care, use it solely to perform under this Agreement, and disclose it only to personnel and advisors with a need to know who are bound by confidentiality obligations at least as protective. Confidential Information excludes information that is public without breach, independently developed, or rightfully received from a third party.

6.2 Compelled disclosure is permitted with prompt notice (where lawful) and reasonable cooperation to seek protective treatment.

6.3 Obligations survive three (3) years after termination; trade secrets survive as long as they remain trade secrets.

### 7. Warranties & Indemnification

7.1 **Performance warranty.** Provider warrants the Services will perform materially in accordance with the Documentation. Customer's exclusive remedy for breach is re-performance or, if Provider cannot re-perform within thirty (30) days, termination of the affected Services and a pro-rata refund of prepaid, unused fees for those Services.

7.2 **Mutual warranties.** Each Party warrants it has the authority to enter this Agreement and will comply with applicable law in its performance.

7.3 **IP indemnification.** Provider shall defend Customer against third-party claims that the Services, as provided and used per this Agreement, infringe a copyright or trademark or misappropriate a trade secret, and shall indemnify Customer for resulting damages finally awarded or agreed in settlement. Where **Enhanced IP Protection** is elected on the Order Form, this obligation extends to patent claims and carries the enhanced cap stated in Section 8.2. Exclusions: combinations with non-Provider materials, Customer content, modifications not made by Provider, and use after notice to stop. Provider may procure rights, modify, or replace the Services; if none is practicable, Provider may terminate the affected Services and refund prepaid, unused fees. This section states Customer's exclusive remedy for IP claims.

7.4 **Customer indemnification.** Customer shall defend and indemnify Provider against third-party claims arising from Customer content, Customer's breach of Section 1.4, or Customer's violation of law.

7.5 **Disclaimer.** EXCEPT AS EXPRESSLY STATED, THE SERVICES ARE PROVIDED WITHOUT OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. AI-ASSISTED OUTPUTS (INCLUDING CLASSIFICATION, EXTRACTION, AND AGENT ARTIFACTS) ARE PROBABILISTIC; CUSTOMER IS RESPONSIBLE FOR HUMAN REVIEW WHERE OUTPUTS HAVE LEGAL OR REGULATORY EFFECT.

### 8. Limitation of Liability

8.1 NEITHER PARTY IS LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS OR REVENUE.

8.2 **General cap.** EACH PARTY'S AGGREGATE LIABILITY IS CAPPED AT THE FEES PAID OR PAYABLE UNDER THIS AGREEMENT IN THE TWELVE (12) MONTHS PRECEDING THE FIRST EVENT GIVING RISE TO LIABILITY. **Super-cap:** for breaches of Section 6 (Confidentiality), breaches of the DPA or Section 4–5 security obligations, and IP indemnification under Section 7.3, the cap is TWO TIMES (2x) such fees. **Uncapped:** fraud, willful misconduct, Customer's payment obligations, and Customer's indemnification under Section 7.4 for claims arising from Customer's willful violation of law.

8.3 All claims arising from the same event or series of connected events count as a single claim for the purposes of the caps in Section 8.2.

### 9. General

9.1 **Entire agreement; precedence.** This Agreement (Parts A–C, the Order Form, the SLA Exhibit, and the Standard Contractual Clauses where applicable) is the entire agreement and supersedes prior proposals and quotes, including {{quote_ref}}. Only the following provisions of the Stirling EULA & Commercial Terms are incorporated: Section 3 (Definitions), Section 8 (AI features), Section 10 (Self-hosted and desktop software), and Section 11 (Fair use). The website Terms of Service do not apply to this Agreement; without limitation, their arbitration and class-waiver provisions, online auto-renewal rules, unilateral-amendment provision, self-serve pricing, and clickwrap acceptance mechanism are expressly excluded. Precedence: Order Form → Standard Contractual Clauses (for international transfers) → DPA → MSA → SLA Exhibit → incorporated EULA sections → Documentation.

9.2 **Governing law; venue.** Delaware law, excluding conflicts rules. Exclusive jurisdiction and venue in the state or federal courts located in San Francisco County, California, and the Parties consent to personal jurisdiction there.

9.3 **Assignment.** Neither Party may assign without the other's consent, except to a successor in a merger, acquisition, or sale of substantially all assets, with notice.

9.4 **Notices.** Written notices to the addresses on the Order Form; email permitted with confirmation of receipt.

9.5 **Force majeure; independent contractors; waiver; severability.** Standard terms apply: neither Party is liable for delay caused by events beyond reasonable control; the Parties are independent contractors; failure to enforce is not waiver; unenforceable provisions are severed with the remainder in effect.

9.6 **Publicity.** Neither Party may use the other's name or marks publicly without prior written consent, except Provider may identify Customer as a customer with Customer's prior approval of the specific use.

9.7 **Suspension.** Provider may suspend the Services for material breach that threatens the security or integrity of the Services, with notice and opportunity to cure where practicable. Undisputed unpaid fees more than thirty (30) days late are grounds for suspension after ten (10) days' notice.

### 10. Termination

10.1 Either Party may terminate for material breach uncured thirty (30) days after written notice, or immediately upon the other's insolvency.

10.2 On termination: Customer's access ends (self-hosted licenses expire per the license mechanism); each Party returns or destroys the other's Confidential Information; the DPA's deletion terms govern Customer Personal Data; Sections 3 (accrued fees), 6, 7, 8, 9, and 10 survive.

10.3 If Customer terminates for Provider's uncured material breach, Provider refunds prepaid fees for the unused remainder of the then-current contract year.
