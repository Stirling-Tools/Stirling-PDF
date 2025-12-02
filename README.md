<p align="center"><img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80"></p>
<h1 align="center">Stirling-PDF</h1>

[![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf)](https://hub.docker.com/r/frooodle/s-pdf)
[![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)](https://discord.gg/HYmhKj45pU)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Stirling-Tools/Stirling-PDF/badge)](https://scorecard.dev/viewer/?uri=github.com/Stirling-Tools/Stirling-PDF)
[![GitHub Repo stars](https://img.shields.io/github/stars/stirling-tools/stirling-pdf?style=social)](https://github.com/Stirling-Tools/stirling-pdf)

<a href="https://www.producthunt.com/posts/stirling-pdf?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-stirling&#0045;pdf" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=641239&theme=light" alt="Stirling&#0032;PDF - Open&#0032;source&#0032;locally&#0032;hosted&#0032;web&#0032;PDF&#0032;editor | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Stirling-Tools/Stirling-PDF/tree/digitalOcean&refcode=c3210994b1af)

[Stirling-PDF](https://www.stirlingpdf.com) is a robust, locally hosted web-based PDF manipulation tool using Docker. It enables you to carry out various operations on PDF files, including splitting, merging, converting, reorganizing, adding images, rotating, compressing, and more. This locally hosted web application has evolved to encompass a comprehensive set of features, addressing all your PDF requirements.

All files and PDFs exist either exclusively on the client side, reside in server memory only during task execution, or temporarily reside in a file solely for the execution of the task. Any file downloaded by the user will have been deleted from the server by that point.

Homepage: [https://stirlingpdf.com](https://stirlingpdf.com)

All documentation available at [https://docs.stirlingpdf.com/](https://docs.stirlingpdf.com/)

![stirling-home](images/stirling-home.jpg)

## Features

- Parallel file processing and downloads
- Dark mode support
- Custom download options
- Custom 'Pipelines' to run multiple features in an automated queue
- API for integration with external scripts
- Optional Login and Authentication support (see [here](https://docs.stirlingpdf.com/Advanced%20Configuration/System%20and%20Security) for documentation)
- Enterprise features like SSO (see [here](https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration) for documentation)
- Database Backup and Import (see [here](https://docs.stirlingpdf.com/Advanced%20Configuration/DATABASE) for documentation)

### 50+ PDF Operations

#### Organise
- **PDF Multi Tool**: Access merge, rotate, rearrange, split and delete actions from a single dashboard
- **Merge**: Combine multiple PDFs into one
- **Split**: Divide PDFs into multiple files
- **Extract page(s)**: Extract specific pages from PDF
- **Remove**: Delete pages from PDF
- **Crop PDF**: Adjust PDF page boundaries
- **Rotate**: Rotate pages in 90-degree increments
- **Adjust page size/scale**: Resize page contents
- **Multi-Page Layout**: Add multiple pages to PDF
- **PDF to Single Large Page**: Convert to single continuous page
- **Organize**: Rearrange PDF pages

#### Convert to PDF
- **Image to PDF**: Convert images to PDF format
- **Convert file to PDF**: Convert various common file types to PDF
- **URL/Website to PDF**: Capture live webpages as PDFs
- **HTML to PDF**: Transform HTML documents to PDF
- **Markdown to PDF**: Convert Markdown files to PDF
- **CBZ to PDF**: Convert comic book archives
- **CBR to PDF**: Convert comic book rar archives
- **Email to PDF**: Convert email files to PDF
- **eBook to PDF**: Convert eBook formats (EPUB, MOBI, AZW3, FB2, TXT, DOCX) to PDF (using Calibre)
- **Vector Image to PDF**: Convert vector images (PS, EPS, EPSF) to PDF format

#### Convert from PDF
- **PDF to Word**: Convert to document (docx, doc, odt) format
- **PDF to Image**: Extract PDF pages as images
- **PDF to RTF (Text)**: Convert to Rich Text Format
- **PDF to Presentation**: Convert to presentation (pptx, ppt, odp) format
- **PDF to CSV**: Extract tables to CSV
- **PDF to XML**: Convert to XML format
- **PDF to HTML**: Transform to HTML
- **PDF to PDF/A**: Convert to archival (PDF/A-1b, PDF/A-2b) format
- **PDF to Markdown**: Convert PDF to Markdown
- **PDF to CBZ**: Convert to comic book archive
- **PDF to CBR**: Convert to comic book rar archive
- **PDF to Vector Image**: Convert PDF to vector image (EPS, PS, PCL, XPS) format
- **PDF to Video Slideshow**: Export pages as an automated video presentation

#### Sign & Security
- **Sign**: Add digital signatures
- **Remove Password**: Remove PDF security
- **Add Watermark**: Apply watermarks
- **Sign with Certificate**: Certificate-based signing
- **Add Stamp to PDF**: Apply digital stamps
- **Auto Redact**: Automatically redact content
- **Change Permissions**: Modify access permissions
- **Add Password**: Apply PDF encryption
- **Manual Redaction**: Manual content redaction
- **Remove Certificate Sign**: Remove digital signatures
- **Sanitize**: Clean PDF of potential security issues
- **Validate PDF Signature**: Verify digital signatures

#### View & Edit
- **OCR / Cleanup scans**: Optical Character Recognition
- **Add Image**: Insert images into PDF
- **Extract Images**: Extract embedded images
- **Extract Attachments**: Retrieve embedded attachments
- **Change Metadata**: Edit PDF metadata
- **Get ALL Info on PDF**: Comprehensive PDF analysis
- **Advanced Colour options**: Colour manipulation (various options for colour inversion, CMYK conversion)
- **Compare**: Compare PDF documents
- **Add Page Numbers**: Insert page numbering
- **Flatten**: Flatten PDF layers, and interactive elements
- **Remove Annotations**: Delete comments and markups
- **Remove Blank pages**: Delete empty pages
- **Remove Image**: Delete embedded images
- **View/Edit PDF**: Interactive PDF editing
- **Unlock PDF Forms**: Enable form editing
- **Add Attachments**: Attach files to PDF

#### Advanced
- **Compress**: Reduce file size
- **Pipeline**: Automated workflow processing (OCR images pipeline, prepare PDFs for emailing pipeline)
- **Adjust Colours/Contrast**: Colour and contrast adjustment
- **Auto Rename PDF File**: Automatic file renaming
- **Auto Split Pages**: Automatic page splitting
- **Detect/Split Scanned photos**: Photo detection and splitting
- **Overlay PDFs**: Layer PDFs over each other
- **Repair**: Fix corrupted PDFs
- **Show JavaScript**: Display embedded JavaScript
- **Auto Split by Size/Count**: Split by file size or page count
- **Split PDF by Chapters**: Chapter-based splitting
- **Split PDF by Sections**: Section-based splitting
- **Scanner Effect**: Apply scanner-like effects
- **Edit Table of Contents**: Modify PDF bookmarks and TOC

# 📖 Get Started

Visit our comprehensive documentation at [docs.stirlingpdf.com](https://docs.stirlingpdf.com) for:

- Installation guides for all platforms
- Configuration options
- Feature documentation
- API reference
- Security setup
- Enterprise features


## Supported Languages

Stirling-PDF currently supports 40 languages!

| Language                                     | Progress                               |
|----------------------------------------------|----------------------------------------|
| Arabic (العربية) (ar_AR)                     | ![58%](https://geps.dev/progress/58)   |
| Azerbaijani (Azərbaycan Dili) (az_AZ)        | ![50%](https://geps.dev/progress/50)   |
| Basque (Euskara) (eu_ES)                     | ![29%](https://geps.dev/progress/29)   |
| Bulgarian (Български) (bg_BG)                | ![82%](https://geps.dev/progress/82)   |
| Catalan (Català) (ca_CA)                     | ![54%](https://geps.dev/progress/54)   |
| Croatian (Hrvatski) (hr_HR)                  | ![79%](https://geps.dev/progress/79)   |
| Czech (Česky) (cs_CZ)                        | ![56%](https://geps.dev/progress/56)   |
| Danish (Dansk) (da_DK)                       | ![49%](https://geps.dev/progress/49)   |
| Dutch (Nederlands) (nl_NL)                   | ![92%](https://geps.dev/progress/92)   |
| English (English) (en_GB)                    | ![100%](https://geps.dev/progress/100) |
| English (US) (en_US)                         | ![100%](https://geps.dev/progress/100) |
| French (Français) (fr_FR)                    | ![85%](https://geps.dev/progress/85)   |
| German (Deutsch) (de_DE)                     | ![86%](https://geps.dev/progress/86)   |
| Greek (Ελληνικά) (el_GR)                     | ![54%](https://geps.dev/progress/54)   |
| Hindi (हिंदी) (hi_IN)                        | ![54%](https://geps.dev/progress/54)   |
| Hungarian (Magyar) (hu_HU)                   | ![85%](https://geps.dev/progress/85)   |
| Indonesian (Bahasa Indonesia) (id_ID)        | ![50%](https://geps.dev/progress/50)   |
| Irish (Gaeilge) (ga_IE)                      | ![55%](https://geps.dev/progress/55)   |
| Italian (Italiano) (it_IT)                   | ![85%](https://geps.dev/progress/85)   |
| Japanese (日本語) (ja_JP)                       | ![79%](https://geps.dev/progress/79)   |
| Korean (한국어) (ko_KR)                         | ![54%](https://geps.dev/progress/54)   |
| Norwegian (Norsk) (no_NB)                    | ![53%](https://geps.dev/progress/53)   |
| Persian (فارسی) (fa_IR)                      | ![52%](https://geps.dev/progress/52)   |
| Polish (Polski) (pl_PL)                      | ![77%](https://geps.dev/progress/77)   |
| Portuguese (Português) (pt_PT)               | ![76%](https://geps.dev/progress/76)   |
| Portuguese Brazilian (Português) (pt_BR)     | ![74%](https://geps.dev/progress/74)   |
| Romanian (Română) (ro_RO)                    | ![46%](https://geps.dev/progress/46)   |
| Russian (Русский) (ru_RU)                    | ![91%](https://geps.dev/progress/91)   |
| Serbian Latin alphabet (Srpski) (sr_LATN_RS) | ![80%](https://geps.dev/progress/80)   |
| Simplified Chinese (简体中文) (zh_CN)            | ![75%](https://geps.dev/progress/75)   |
| Slovakian (Slovensky) (sk_SK)                | ![41%](https://geps.dev/progress/41)   |
| Slovenian (Slovenščina) (sl_SI)              | ![57%](https://geps.dev/progress/57)   |
| Spanish (Español) (es_ES)                    | ![85%](https://geps.dev/progress/85)   |
| Swedish (Svenska) (sv_SE)                    | ![52%](https://geps.dev/progress/52)   |
| Thai (ไทย) (th_TH)                           | ![47%](https://geps.dev/progress/47)   |
| Tibetan (བོད་ཡིག་) (bo_CN)                   | ![52%](https://geps.dev/progress/52)   |
| Traditional Chinese (繁體中文) (zh_TW)           | ![82%](https://geps.dev/progress/82)   |
| Turkish (Türkçe) (tr_TR)                     | ![80%](https://geps.dev/progress/80)   |
| Ukrainian (Українська) (uk_UA)               | ![57%](https://geps.dev/progress/57)   |
| Vietnamese (Tiếng Việt) (vi_VN)              | ![46%](https://geps.dev/progress/46)   |
| Malayalam (മലയാളം) (ml_IN)                   | ![59%](https://geps.dev/progress/59)   |

## Stirling PDF Enterprise

Stirling PDF offers an Enterprise edition of its software. This is the same great software but with added features, support and comforts.
Check out our [Enterprise docs](https://docs.stirlingpdf.com/Pro)


## 🤝 Looking to contribute?

Join our community:
- [Contribution Guidelines](CONTRIBUTING.md)
- [Translation Guide (How to add custom languages)](devGuide/HowToAddNewLanguage.md)
- [Developer Guide](devGuide/DeveloperGuide.md)
- [Issue Tracker](https://github.com/Stirling-Tools/Stirling-PDF/issues)
- [Discord Community](https://discord.gg/HYmhKj45pU)
