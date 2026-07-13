# Stirling PDF — Subprocessors

Referenced by DPA §C5 and Annex III, and by EULA §8. Changes to this list carry 30 days' notice per DPA §C5. Last updated: {{version_date}}.

Stirling PDF, Inc. uses the following subprocessors to provide the Services. Customer files are processed within Stirling's own infrastructure; **no customer files are transmitted to any AI provider.**

| Subprocessor | Purpose | Data processed | Location |
| --- | --- | --- | --- |
| **Amazon Web Services (AWS)** | Cloud infrastructure and storage for Stirling Cloud | Customer files (encrypted at rest), account and usage data | United States (EU region availability per deployment — see DPA §C8 note) |
| **Stripe** | Payment processing | Billing contact and transaction data. Payment card details go directly to Stripe, which acts as an independent controller for them | United States |
| **Supabase** | Account and workspace data infrastructure | Account, workspace, and configuration data | United States |
| **Google** | Transactional and operational email delivery | Names, email addresses, message content of service emails | United States |
| **Anthropic** | AI models (Claude) powering the Stirling Agent and AI-assisted features | Prompts and queries only — never customer files | United States |
| **Voyage AI** | Embedding models for Ingestion/RAG features | Extracted text excerpts, only where the customer enables Ingestion/RAG, solely to generate embeddings — never customer files | United States |
| **PostHog** | Product telemetry and usage analytics | Pseudonymous usage events and diagnostic data — never file content | European Union (EU-hosted) |

Neither AI provider uses customer data for model training (contractually confirmed).

Self-hosted and air-gapped deployments: customer files remain in the customer's environment; Stirling receives license-validation and metering data only (process counts, file sizes, file hashes — never file names or content).
