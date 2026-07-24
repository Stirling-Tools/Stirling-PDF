# SLA Exhibit — Stirling Enterprise Agreement

Referenced by the Order Form's service-level row and MSA Section 5.2. One document, three tiers; the Order Form's tier selection determines the applicable column. Uptime is a target, not a credited commitment: no service credits apply at any tier. Tiers differentiate support response, channels, and people.

## 1. Availability

For Stirling Cloud deployments, Provider targets **99.9% monthly uptime**, measured at the API and console endpoints, excluding scheduled maintenance announced at least 48 hours in advance and events beyond Provider's reasonable control. Current and historical status is published at the system status page. No service credits apply; persistent material failure to meet the target is addressed through MSA §7.1 (performance warranty and remedies) and §10 (termination for material breach).

Self-hosted and Air-gapped deployments: availability of the runtime is Customer's responsibility; this Section applies to Provider's license, metering, and update services.

## 2. Support tiers

| | **Standard** | **Priority** | **Dedicated** |
| --- | --- | --- | --- |
| Included with | Every Enterprise Agreement | Every Enterprise Agreement | The Dedicated SE/CSM line item ($30,000/yr) |
| Hours | Business hours (Mon–Fri, 9:00–18:00 US Eastern, excl. US holidays) | Business hours + extended (7:00–21:00 US Eastern) | 24×7 for Severity 1 |
| Channels | Email, in-product | Email, in-product, private Slack/Teams channel | All Priority channels + named Solutions Engineer and CSM |
| Severity 1 first response (production down / processing halted org-wide) | 8 business hours | 4 hours | 1 hour, 24×7 |
| Severity 2 (major feature degraded, no workaround) | Next business day | 8 business hours | 4 hours |
| Severity 3 (minor defect, workaround exists) | 3 business days | 2 business days | Next business day |
| Severity 4 (question, cosmetic) | 5 business days | 3 business days | 2 business days |
| Escalation path | Support queue | Support lead | Named SE → CSM → Provider executive |
| Business reviews | — | — | Quarterly, where the QBR line item is elected |

First response = a qualified human engaging with the issue, not an acknowledgment autoresponder. Resolution times are not committed; Provider works Severity 1 issues continuously within the tier's hours until resolved or downgraded.

## 3. Severity is set by Customer, subject to reasonable reclassification

Customer designates severity at filing; Provider may reclassify with explanation. Severity 1 requires production impact in a live (non-evaluation) environment.

## 4. Maintenance and updates

Scheduled maintenance is announced at least 48 hours ahead and targeted at low-usage windows. Security patches for supported versions ship to all tiers at no charge (MSA §5.4). Trials and evaluations are provided AS IS and are outside this Exhibit (EULA §9).

## 5. Exclusions

This Exhibit does not apply to: issues caused by Customer's environment, modifications, or third-party systems; usage exceeding the fair-use provisions; Preview/Beta features; or Force Majeure events (MSA §9.5).
