import type {
  PdfTemplate,
  PdfTemplateCategory,
} from "@editor/services/createPdf/newPdfDocuments";

export const PDF_TEMPLATE_CATEGORIES: readonly PdfTemplateCategory[] = [
  "paper",
  "documents",
  "business",
  "forms",
  "planning",
  "design",
];

export const PDF_TEMPLATES: readonly PdfTemplate[] = [
  {
    id: "blank",
    category: "paper",
    title: "Untitled",
    keywords: "empty new",
    body: "",
  },
  {
    id: "lined",
    category: "paper",
    title: "Lined paper",
    keywords: "notes notebook writing ruled",
    body: `~ Date: ____________________
@lined`,
  },
  {
    id: "dots",
    category: "paper",
    title: "Dot grid",
    keywords: "graph bullet journal sketch",
    body: "@dots",
  },
  {
    id: "letter",
    category: "documents",
    title: "Letter",
    keywords:
      "cover letter resignation reference complaint thank you formal business",
    body: `! Your Name
~ 123 Street Name, City, Postcode
~ you@example.com  ·  +1 555 0100
---
> 1 January 2026

Recipient Name
Company Name
456 Avenue Road, City, Postcode

Dear Recipient,

Write the opening paragraph here: say who you are and why you are writing.

Use the middle paragraphs for the details, one idea per paragraph.

Close with what you would like to happen next and how to reach you.

Sincerely,

! Your Name`,
  },
  {
    id: "memo",
    category: "documents",
    title: "Memo",
    keywords: "memorandum notice announcement internal",
    body: `# Memo
| ~ To | Team
| ~ From | Your Name
| ~ Date | 1 January 2026
| ~ Subject | Subject of the memo
---
State the purpose of the memo in one or two sentences.

## Background
Give the context the reader needs.

## Action required
- What needs to happen
- Who is responsible, and by when`,
  },
  {
    id: "report",
    category: "documents",
    title: "Report",
    keywords: "cover page proposal business plan essay paper status",
    body: `@band Company Name
@space 22%
= Report Title
~ A short subtitle that explains what this report covers
@space 4%
! Prepared by Your Name
~ 1 January 2026
@page
# Report Title
## Summary
Summarise the findings and recommendations in a short paragraph.

## Findings
Describe what you found, with evidence.

| Measure | Last year | This year
|---
| Revenue | 120,000 | 150,000
| Customers | 340 | 410

## Recommendations
- First recommendation
- Second recommendation`,
  },
  {
    id: "newsletter",
    category: "documents",
    title: "Newsletter",
    keywords: "bulletin update article two column",
    body: `@band Newsletter | Issue 1  ·  January 2026
@columns 50
## Main story
Open with the most important news. Keep paragraphs short so they read well in a narrow column.

Add a second paragraph with the detail and a quote from someone involved.

## Dates for the diary
- 12 January: Team event
- 26 January: Open day
@next
## Around the team
A shorter story, a welcome for someone new, or a thank-you.

## In brief
- A quick update
- Another quick update
- A link or contact for more
@end`,
  },
  {
    id: "invoice",
    category: "business",
    title: "Invoice",
    keywords: "quote estimate receipt bill purchase order credit note proforma",
    body: `@band Invoice | Your Company Ltd  ·  billing@example.com
| ~ Invoice number | INV-0001
| ~ Date | 1 January 2026
| ~ Bill to | Client Name, Client address, City

| Description | Qty | Unit price | Amount
|---
| Design work | 10 | 50.00 | 500.00
| Development | 20 | 60.00 | 1,200.00
| Hosting (1 year) | 1 | 120.00 | 120.00
|---
| | | Subtotal | 1,820.00
| | | Tax (20%) | 364.00
| | | ! Total | ! 2,184.00

### Payment
Please pay within 30 days to account 12345678, sort code 00-00-00.`,
  },
  {
    id: "meetingNotes",
    category: "business",
    title: "Meeting notes",
    keywords: "agenda minutes meeting",
    body: `# Meeting notes
| ~ Date | 1 January 2026
| ~ Attendees | Names
---
## Agenda
- Topic one
- Topic two

## Notes
@space 90

## Actions
| Action | Owner | Due
|---
| Follow up | Name | 8 Jan
| Share notes | Name | 3 Jan`,
  },
  {
    id: "table",
    category: "business",
    title: "Sign-in sheet",
    keywords: "table attendance register log inventory list",
    body: `# Sign-in sheet
~ Event or location  ·  Date
@boxes 18 | Name | Organisation | Time in | Signature`,
  },
  {
    id: "form",
    category: "forms",
    title: "Form",
    keywords:
      "registration application enrolment contact details questionnaire",
    body: `# Registration form
~ Please complete every section in block capitals.
## Your details
: Full name | Date of birth
: Email | Phone
: Address
## Questions
: What would you like to sign up for?
: How did you hear about us?
[ ] I agree to the terms and conditions
_ Signature | Date`,
  },
  {
    id: "agreement",
    category: "forms",
    title: "Agreement",
    keywords: "contract nda consent release service terms",
    body: `# Agreement
~ This agreement is made on 1 January 2026 between:
: Party A | Party B
## 1. Purpose
Describe what the parties are agreeing to.
## 2. Terms
- The first obligation
- The second obligation
- How long the agreement lasts
## 3. Signatures
By signing, both parties agree to the terms above.
_ Party A signature | Date
_ Party B signature | Date`,
  },
  {
    id: "checklist",
    category: "planning",
    title: "Checklist",
    keywords: "to do todo packing shopping tasks list",
    body: `# Checklist
~ Date: ____________________
## Today
[ ] First task
[ ] Second task
[ ] Third task
## This week
[ ] First task
[ ] Second task
[ ] Third task
## Later
[ ] First task
[ ] Second task`,
  },
  {
    id: "calendar",
    category: "planning",
    title: "Month calendar",
    keywords: "month planner schedule dates",
    body: `# Month 2026
@boxes 5 | Mon | Tue | Wed | Thu | Fri | Sat | Sun`,
  },
  {
    id: "weekly",
    category: "planning",
    title: "Weekly planner",
    keywords: "timetable schedule class rota week habit tracker",
    body: `# Week of ____________
@boxes 1 | Monday | Tuesday | Wednesday | Thursday | Friday | Weekend`,
  },
  {
    id: "resume",
    category: "design",
    title: "Resume",
    keywords: "cv curriculum vitae job",
    body: `@sidebar 34
@space 20
# Your Name
~ Job title
@space 12
### Contact
~ you@example.com
~ +1 555 0100
~ City, Country
@space 12
### Skills
- Skill one
- Skill two
- Skill three
@space 12
### Languages
~ English, Spanish
@next
@space 20
## Profile
Two or three sentences about who you are and the work you want next.
## Experience
! Job Title, Company
~ 2022 to present
- What you did and the result it had
- Another achievement with a number
! Job Title, Company
~ 2019 to 2022
- What you did and the result it had
## Education
! Degree, University
~ 2015 to 2019
@end`,
  },
  {
    id: "certificate",
    category: "design",
    title: "Certificate",
    keywords: "award achievement completion diploma",
    body: `@border
@space 20%
^ ### Certificate of achievement
@space 12
^ ~ This certificate is presented to
@space 10
^ = Recipient Name
@space 6
^ for outstanding work and commitment during 2026.
@space 10%
_ Signature | Date`,
  },
  {
    id: "flyer",
    category: "design",
    title: "Flyer",
    keywords: "poster event invitation party announcement",
    body: `@band Event Name | Saturday 1 February  ·  7pm
@space 10%
^ = Big headline
^ ~ One line that tells people why they should come.
@space 6%
^ ! Venue Name, 123 Street Name, City
^ Free entry  ·  Food and drinks  ·  Live music
@space 8%
^ ### More information
^ ~ example.com  ·  hello@example.com`,
  },
];
