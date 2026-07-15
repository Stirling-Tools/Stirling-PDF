## Part C — Data Processing Addendum

This DPA forms part of the Agreement and applies where Provider processes Personal Data on Customer's behalf.

### C1. Roles; scope; instructions

Customer is the controller (or a processor on behalf of its own controllers); Provider is a processor (or subprocessor, as applicable). Provider processes Personal Data only on Customer's documented instructions — including processing initiated by Customer's users, policies, pipelines, and API calls — unless required by law (in which case Provider informs Customer unless legally prohibited). **Provider will inform Customer without undue delay if, in Provider's opinion, an instruction infringes the GDPR, UK GDPR, or other applicable data-protection law.** Customer is responsible for the lawfulness of the Personal Data it submits and the instructions it gives; Customer's rights under this DPA include instruction, audit (C9), objection to subprocessors (C5), assistance (C6), and return or deletion of data (C10).

### C2. Details of processing

**Subject matter/nature:** PDF processing and governance (classification, redaction, routing, retention, conversion, signing, extraction, AI-assisted analysis). **Duration:** the Term plus the deletion period. **Categories of data:** any Personal Data contained in Customer files and metadata (names, contact details, identifiers, financial or health data if present in Customer files), account data of Customer users. **Data subjects:** Customer's employees, users, customers, and other persons appearing in Customer files. **Sensitive data:** may be present in Customer files at Customer's discretion; Customer is responsible for the lawful basis.

### C3. Confidentiality; personnel

Provider ensures persons authorized to process Personal Data are bound by confidentiality and receive security training. Zero-standing-access applies: content access is just-in-time, logged, and audited (MSA Section 4.2).

### C4. Security measures (Annex II summary)

Encryption in transit (TLS 1.2+) and at rest (AES-256); zero-standing-access with audited JIT elevation; role-based access control; SSO/SCIM; tenant isolation; vulnerability management and penetration testing; audit logging of processing events (including file name, hash, size, and operations); backup and recovery. For Self-hosted and Air-gapped deployments, Customer operates the runtime environment and is responsible for infrastructure-level controls; Provider's measures apply to license/metering services and support access.

### C5. Subprocessors

Customer generally authorizes the subprocessors listed at {{subprocessor_url}}: cloud infrastructure (Amazon Web Services), payment processing (Stripe, as independent controller for payment data), email delivery (Google), account infrastructure (Supabase), product telemetry (PostHog, EU-hosted; pseudonymous usage events, never file content), and AI model providers: **Anthropic** (Claude models — receives prompts and queries only) and **Voyage AI** (embedding models — receives extracted text excerpts solely to generate embeddings where Customer enables Ingestion/RAG features). **Customer files are never transmitted to any AI provider.** Neither AI provider trains on Customer data (verified against the signed provider agreements, Jul 10, 2026). Provider gives thirty (30) days' notice of new subprocessors; Customer may object on reasonable data-protection grounds, and if unresolved, may terminate the affected Services with a pro-rata refund. **Provider imposes data-protection obligations on each subprocessor by written contract that are at least as protective as this DPA, and remains fully responsible to Customer for each subprocessor's performance.**

### C6. Data subject requests; assistance

Taking into account the nature of the processing, Provider provides reasonable assistance (including through the Processor's search, redaction, and audit tools) for Customer's obligations under GDPR Articles 32–36: security of processing, breach notification to authorities and data subjects, data protection impact assessments, and prior consultations with supervisory authorities, as well as responses to data subject requests. Provider forwards requests received directly to Customer and does not respond except as legally required. **Provider makes available to Customer all information necessary to demonstrate compliance with this DPA and allows for and contributes to audits, including inspections, per Section C9.**

### C7. Breach notification

Per MSA Section 5.3: without undue delay after becoming aware of a Personal Data Breach, and in any event within forty-eight (48) hours of awareness, with information provided in phases as available — including the nature of the breach, categories and approximate volumes affected, likely consequences, and measures taken or proposed.

### C8. International transfers

Where Personal Data subject to GDPR/UK GDPR is transferred to countries without adequacy, the Parties incorporate the EU Standard Contractual Clauses (Commission Decision 2021/914): **Module 2** (controller-to-processor) where Customer is a controller, and **Module 3** (processor-to-processor) where Customer acts as a processor, with the following selections — Clause 7 (docking): included; Clause 9(a): Option 2 (general written authorization, 30 days' notice per C5); Clause 11(a) optional language: not used; Clause 17: the law of Ireland; Clause 18: the courts of Ireland; competent supervisory authority: the Irish Data Protection Commission (per Annex I.C). Annex I (parties, description of transfer: as per Section C2), Annex II (technical and organizational measures: as per Section C4), and Annex III (subprocessors: as per Section C5 and {{subprocessor_url}}) are completed by reference to this DPA. For UK transfers, the UK International Data Transfer Addendum applies with its Tables completed by reference to the foregoing. Provider is not certified under the EU-U.S. Data Privacy Framework; the SCCs are the transfer mechanism.

**Note:** Provider does not currently offer contractual EU data residency for Stirling Cloud; residency is achieved via Self-hosted or Air-gapped deployment.

### C9. Audits

Provider's security reports and documentation (Section 5.1) are the ordinary means of demonstrating compliance. Customer may additionally audit — by itself or a mandated auditor — once per year on thirty (30) days' notice, and at any time where: (a) a security incident affecting Customer Personal Data has occurred; (b) provided documentation reveals a material deficiency; (c) a competent supervisory authority requires it; or (d) Customer reasonably suspects material noncompliance with this DPA. Audits are conducted during business hours, under confidentiality, at Customer's cost, with reasonable notice, without unreasonable interference with Provider's operations, and without access to other customers' data.

### C10. Return & deletion

On termination, at Customer's choice, Provider returns Customer file content and Personal Data (export of Customer files and the governed-record metadata) and/or deletes them — from live systems within thirty (30) days and from backups within ninety (90) days — except as retention is required by law, and certifies deletion on request. Where Customer uses HYOK, key destruction by Customer renders content cryptographically inaccessible immediately.

### C11. CCPA/CPRA

Provider is a "service provider" under the CCPA/CPRA. Provider: (a) processes Personal Information only for the business purposes specified in this Agreement — providing, securing, metering, and supporting the Services described in Section C2; (b) shall not sell or share Personal Information; (c) shall not retain, use, or disclose it for any purpose other than those business purposes, or outside the direct business relationship between the Parties; (d) shall not combine it with Personal Information received from other sources, except as permitted by CCPA regulations for the business purposes; (e) provides the same level of privacy protection required of businesses by the CCPA; (f) will notify Customer if it determines it can no longer meet its CCPA obligations; (g) grants Customer the right, upon reasonable notice, to take reasonable and appropriate steps to ensure Provider's use of Personal Information is consistent with Customer's obligations, and to stop and remediate any unauthorized use; and (h) flows these requirements down to its subprocessors per Section C5. Provider certifies that it understands these restrictions and will comply with them.

### C12. Liability

Liability under this DPA is subject to the MSA's limitations (Section 8).
