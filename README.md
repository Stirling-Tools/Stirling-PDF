<p align="center">
  <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80" alt="Stirling PDF logo">
</p>

<h1 align="center">Stirling PDF</h1>

<p align="center">
  The open‑source alternative to Adobe Acrobat for individuals, teams, and developers.
</p>

<p align="center">
  <a href="https://hub.docker.com/r/stirlingtools/stirling-pdf">
    <img src="https://img.shields.io/docker/pulls/frooodle/s-pdf" alt="Docker Pulls">
  </a>
  <a href="https://discord.gg/HYmhKj45pU">
    <img src="https://img.shields.io/discord/1068636748814483718?label=Discord" alt="Discord">
  </a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/Stirling-Tools/Stirling-PDF">
    <img src="https://api.scorecard.dev/projects/github.com/Stirling-Tools/Stirling-PDF/badge" alt="OpenSSF Scorecard">
  </a>
  <a href="https://github.com/Stirling-Tools/stirling-pdf">
    <img src="https://img.shields.io/github/stars/stirling-tools/stirling-pdf?style=social" alt="GitHub Repo stars">
  </a>
</p>

---

Stirling PDF is a powerful, open‑source PDF application designed to replace Adobe Acrobat.

Run it locally or on‑premise, access it through a modern web UI, and integrate it via APIs to edit, sign, redact, convert, and automate millions of PDFs — all without sending documents to third‑party SaaS.

- **20M+ downloads**
- **Tens of thousands of companies**
- Used by **72% of the Fortune 500**

Homepage: **https://stirlingpdf.com**  
Documentation: **https://docs.stirlingpdf.com**

![Stirling PDF Home](images/stirling-home.jpg)

---

## Table of Contents

- [Overview](#overview)
- [Key Capabilities](#key-capabilities)
  - [Edit & Page Operations](#edit--page-operations)
  - [Conversion & Export](#conversion--export)
  - [Security & Compliance](#security--compliance)
  - [Automation & Workflows](#automation--workflows)
  - [Developer Platform](#developer-platform)
- [Architecture & Security](#architecture--security)
- [Getting Started](#getting-started)
- [Language Support](#language-support)
- [Enterprise Edition](#enterprise-edition)
- [Contributing & Community](#contributing--community)
- [License](#license)

---

## Overview

Stirling PDF is a self‑hosted, web‑based PDF platform built on Docker. It provides:

- A **modern dashboard** with 50+ tools for PDF editing, signing, redaction, and conversion.
- **No‑code automation** to chain tools into reusable workflows.
- A **developer platform** with APIs, SDKs, and on‑prem AI integrations.
- **Enterprise‑grade deployment options** for teams that need strict security and compliance.

All files and PDFs either remain on the client, stay in server memory only for the duration of the operation, or are stored temporarily for processing and deleted before download completes.

---

## Key Capabilities

### Edit & Page Operations

Build and refine PDFs with full control over pages and content:

- Interactive viewer with search, zoom, and multi‑page navigation.
- Annotate, draw, and add text or images.
- Merge multiple PDFs into a single document.
- Split PDFs by page range, section, or automatically using page dividers.
- Reorder, rotate, or remove pages.
- Crop pages, adjust contrast, and scale content.
- Generate multi‑page layouts (e.g., multiple pages per sheet).
- Overlay PDFs, convert to a single long page, or extract specific pages.

### Conversion & Export

Convert between PDF and a wide range of formats:

- Convert PDFs to and from images.
- Convert common office formats to PDF (via LibreOffice).
- Export PDFs to Word, PowerPoint, and more (via LibreOffice).
- Convert HTML, URLs, and Markdown to PDF.
- Export PDF content to CSV or XML.
- Convert to PDF/A for archival workflows.

### Security & Compliance

Protect sensitive information and enforce document policies:

- Add or remove passwords.
- Set and modify PDF permissions.
- Add watermarks (text or image).
- Certify and digitally sign PDFs.
- Sanitize PDFs and remove active content.
- Auto‑redact detected text and remove annotations.
- Remove embedded JavaScript and unwanted metadata.

### Automation & Workflows

Save time and standardize recurring processes:

- **No‑code Pipelines**: Chain multiple tools into reusable workflows.
- Parallel processing of files with concurrent downloads.
- Split by file size or number of pages.
- Automatic blank‑page detection and removal.
- Auto‑rename files based on detected header text.
- OCR with Tesseract to make scans searchable.
- Extract or remove images from PDFs.
- Repair corrupt PDFs and flatten documents.

### Developer Platform

Build PDF‑driven applications and automation:

- **Core APIs**: 50+ endpoints for conversion, compression, redaction, ingestion, and more.
- **SDKs**: Prebuilt libraries for popular languages to integrate quickly.
- **Developer Console**: Monitor usage, manage API keys, and debug workflows with real‑time insights.
- **On‑Prem AI Infrastructure**: Run PDF‑centric AI workloads (pretraining, agents, and document understanding) close to your data.
- **Quickstart Guides**: Code snippets and examples to get up and running in minutes.

Visit the API docs: https://docs.stirlingpdf.com

---

## Architecture & Security

Stirling PDF is designed for security‑sensitive environments:

- **Self‑hosted and on‑premise**: Run on your own infrastructure, in your own VPC, or in air‑gapped environments.
- **Ephemeral processing**: Files are kept in memory or temporary storage only for the duration of the job and are deleted before download.
- **Authentication & SSO**: Optional login, role‑based access control, and SSO (see [System & Security](https://docs.stirlingpdf.com/Advanced%20Configuration/System%20and%20Security) and [SSO Configuration](https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration)).
- **Database backup & import**: Built‑in tooling for backup and restore (see [Database docs](https://docs.stirlingpdf.com/Advanced%20Configuration/DATABASE)).

---

## Getting Started

Comprehensive installation and configuration guides are available at:  
**https://docs.stirlingpdf.com**

You’ll find:

- **Self‑hosting guides** for Docker and other platforms.
- **Configuration reference** (environment variables, storage, security settings).
- **Feature documentation** for every tool in the UI.
- **API and SDK guides** for developers.
- **Enterprise deployment patterns** for larger teams.

> For production deployments, we recommend reviewing the security and backup sections in the docs before going live.

---

## Language Support

Stirling PDF currently supports **40 languages**.

| Language                                     | Progress                               |
| ------------------------------------------- | -------------------------------------- |
| Arabic (العربية) (ar_AR)                    | ![87%](https://geps.dev/progress/87)   |
| Azerbaijani (Azərbaycan Dili) (az_AZ)       | ![86%](https://geps.dev/progress/86)   |
| Basque (Euskara) (eu_ES)                    | ![86%](https://geps.dev/progress/86)   |
| Bulgarian (Български) (bg_BG)               | ![86%](https://geps.dev/progress/86)   |
| Catalan (Català) (ca_CA)                    | ![85%](https://geps.dev/progress/85)   |
| Croatian (Hrvatski) (hr_HR)                 | ![86%](https://geps.dev/progress/86)   |
| Czech (Česky) (cs_CZ)                       | ![84%](https://geps.dev/progress/84)   |
| Danish (Dansk) (da_DK)                      | ![85%](https://geps.dev/progress/85)   |
| Dutch (Nederlands) (nl_NL)                  | ![85%](https://geps.dev/progress/85)   |
| English (English) (en_GB)                   | ![100%](https://geps.dev/progress/100) |
| English (US) (en_US)                        | ![100%](https://geps.dev/progress/100) |
| French (Français) (fr_FR)                   | ![85%](https://geps.dev/progress/85)   |
| German (Deutsch) (de_DE)                    | ![86%](https://geps.dev/progress/86)   |
| Greek (Ελληνικά) (el_GR)                    | ![86%](https://geps.dev/progress/86)   |
| Hindi (हिंदी) (hi_IN)                       | ![86%](https://geps.dev/progress/86)   |
| Hungarian (Magyar) (hu_HU)                  | ![86%](https://geps.dev/progress/86)   |
| Indonesian (Bahasa Indonesia) (id_ID)       | ![85%](https://geps.dev/progress/85)   |
| Irish (Gaeilge) (ga_IE)                     | ![86%](https://geps.dev/progress/86)   |
| Italian (Italiano) (it_IT)                  | ![85%](https://geps.dev/progress/85)   |
| Japanese (日本語) (ja_JP)                  | ![86%](https://geps.dev/progress/86)   |
| Korean (한국어) (ko_KR)                    | ![86%](https://geps.dev/progress/86)   |
| Norwegian (Norsk) (no_NB)                   | ![86%](https://geps.dev/progress/86)   |
| Persian (فارسی) (fa_IR)                     | ![86%](https://geps.dev/progress/86)   |
| Polish (Polski) (pl_PL)                     | ![86%](https://geps.dev/progress/86)   |
| Portuguese (Português) (pt_PT)              | ![86%](https://geps.dev/progress/86)   |
| Portuguese Brazilian (Português) (pt_BR)    | ![86%](https://geps.dev/progress/86)   |
| Romanian (Română) (ro_RO)                   | ![85%](https://geps.dev/progress/85)   |
| Russian (Русский) (ru_RU)                   | ![86%](https://geps.dev/progress/86)   |
| Serbian Latin alphabet (Srpski) (sr_LATN_RS)| ![86%](https://geps.dev/progress/86)   |
| Simplified Chinese (简体中文) (zh_CN)       | ![87%](https://geps.dev/progress/87)   |
| Slovakian (Slovensky) (sk_SK)               | ![86%](https://geps.dev/progress/86)   |
| Slovenian (Slovenščina) (sl_SI)             | ![86%](https://geps.dev/progress/86)   |
| Spanish (Español) (es_ES)                   | ![86%](https://geps.dev/progress/86)   |
| Swedish (Svenska) (sv_SE)                   | ![86%](https://geps.dev/progress/86)   |
| Thai (ไทย) (th_TH)                          | ![86%](https://geps.dev/progress/86)   |
| Tibetan (བོད་ཡིག་) (bo_CN)                 | ![65%](https://geps.dev/progress/65)   |
| Traditional Chinese (繁體中文) (zh_TW)      | ![87%](https://geps.dev/progress/87)   |
| Turkish (Türkçe) (tr_TR)                    | ![86%](https://geps.dev/progress/86)   |
| Ukrainian (Українська) (uk_UA)              | ![86%](https://geps.dev/progress/86)   |
| Vietnamese (Tiếng Việt) (vi_VN)             | ![86%](https://geps.dev/progress/86)   |
| Malayalam (മലയാളം) (ml_IN)                 | ![73%](https://geps.dev/progress/73)   |

Interested in contributing translations? See the [Translation Guide](devGuide/HowToAddNewLanguage.md).

---

## Enterprise Edition

Stirling PDF offers an **Enterprise edition** for organizations that need additional features, support, and governance on top of the open‑source core.

Enterprise highlights include:

- Advanced authentication, SSO, and role‑based access control.
- Enterprise‑grade monitoring, auditing, and performance tuning.
- Priority support and onboarding assistance.
- Enhanced deployment options for large‑scale and regulated environments.

Learn more in the [Enterprise docs](https://docs.stirlingpdf.com/Pro).

---

## Contributing & Community

We welcome contributions from developers, translators, and users.

- [Contribution Guidelines](CONTRIBUTING.md)
- [Developer Guide](devGuide/DeveloperGuide.md)
- [Translation Guide](devGuide/HowToAddNewLanguage.md)
- [Issue Tracker](https://github.com/Stirling-Tools/Stirling-PDF/issues)
- [Discord Community](https://discord.gg/HYmhKj45pU)

Whether you’re fixing a bug, adding a new language, or proposing a new tool, we’d love your help.

---

## License

Stirling PDF is open source. See the [`LICENSE`](LICENSE) file in this repository for full details.
