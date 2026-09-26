# Shared Signing review and demo material

These documents accompany the signing reliability and navigation changes. They record the local evaluation on 24 September 2026 against base `910b5d012f` plus the patch; they do not certify every deployment or announce a published release.

- [Customer guide supplement](./customer-guide.md) and [printable guide](./customer-guide.pdf)
- [Self-hosted installation and entitlement requirements](./self-hosted-installation-requirements.md)
- [Customer demo plan](./demo-plan.md)
- [User stories and acceptance assessment](./user-stories-closure.md)
- [Implementation, verification and remaining gates](./blocking-work-report.md)
- [Detailed release-gate plan](./release-gate-plan.md)
- [Original Sign experience and next design steps](./sign-experience-history.md)

Official product instructions remain in [Stirling's documentation](https://docs.stirlingpdf.com/Functionality/Security/Shared-Signing/). The customer guide adds the navigation and practical decisions specific to this patch. Review material is kept here for the PR; it does not replace updating the separate public documentation repository when the feature ships.

The original baseline, raw acceptance ledger, database audit, runtime data, test certificates, passwords and machine-specific scripts remain local. Reproduce unit/integration coverage using the repository's backend/frontend Task commands. A live acceptance run needs a separate synthetic PDF, ordinary test users and certificates with distinct subjects; none should be real customer credentials or documents.
