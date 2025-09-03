import React, { useMemo } from "react";
import LocalIcon from "../components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import OCRPanel from "../tools/OCR";
import ConvertPanel from "../tools/Convert";
import Sanitize from "../tools/Sanitize";
import AddPassword from "../tools/AddPassword";
import ChangePermissions from "../tools/ChangePermissions";
import RemovePassword from "../tools/RemovePassword";
import { SubcategoryId, ToolCategoryId, ToolRegistry } from "./toolsTaxonomy";
import AddWatermark from "../tools/AddWatermark";
import Repair from "../tools/Repair";
import SingleLargePage from "../tools/SingleLargePage";
import UnlockPdfForms from "../tools/UnlockPdfForms";
import RemoveCertificateSign from "../tools/RemoveCertificateSign";
import ManageSignatures from "../tools/ManageSignatures";
import BookletImposition from "../tools/BookletImposition";
import { compressOperationConfig } from "../hooks/tools/compress/useCompressOperation";
import { splitOperationConfig } from "../hooks/tools/split/useSplitOperation";
import { addPasswordOperationConfig } from "../hooks/tools/addPassword/useAddPasswordOperation";
import { removePasswordOperationConfig } from "../hooks/tools/removePassword/useRemovePasswordOperation";
import { sanitizeOperationConfig } from "../hooks/tools/sanitize/useSanitizeOperation";
import { repairOperationConfig } from "../hooks/tools/repair/useRepairOperation";
import { addWatermarkOperationConfig } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import { unlockPdfFormsOperationConfig } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { singleLargePageOperationConfig } from "../hooks/tools/singleLargePage/useSingleLargePageOperation";
import { ocrOperationConfig } from "../hooks/tools/ocr/useOCROperation";
import { convertOperationConfig } from "../hooks/tools/convert/useConvertOperation";
import { removeCertificateSignOperationConfig } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { changePermissionsOperationConfig } from "../hooks/tools/changePermissions/useChangePermissionsOperation";
import { manageSignaturesOperationConfig } from "../hooks/tools/manageSignatures/useManageSignaturesOperation";
import { bookletImpositionOperationConfig } from "../hooks/tools/bookletImposition/useBookletImpositionOperation";
import CompressSettings from "../components/tools/compress/CompressSettings";
import SplitSettings from "../components/tools/split/SplitSettings";
import AddPasswordSettings from "../components/tools/addPassword/AddPasswordSettings";
import RemovePasswordSettings from "../components/tools/removePassword/RemovePasswordSettings";
import SanitizeSettings from "../components/tools/sanitize/SanitizeSettings";
import RepairSettings from "../components/tools/repair/RepairSettings";
import UnlockPdfFormsSettings from "../components/tools/unlockPdfForms/UnlockPdfFormsSettings";
import AddWatermarkSingleStepSettings from "../components/tools/addWatermark/AddWatermarkSingleStepSettings";
import OCRSettings from "../components/tools/ocr/OCRSettings";
import ConvertSettings from "../components/tools/convert/ConvertSettings";
import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";
import CertificateTypeSettings from "../components/tools/manageSignatures/CertificateTypeSettings";
import BookletImpositionSettings from "../components/tools/bookletImposition/BookletImpositionSettings";
import { ToolId } from "../types/toolId";

const showPlaceholderTools = true; // Show all tools; grey out unavailable ones in UI

// Convert tool supported file formats
export const CONVERT_SUPPORTED_FORMATS = [
  // Microsoft Office
  "doc",
  "docx",
  "dot",
  "dotx",
  "csv",
  "xls",
  "xlsx",
  "xlt",
  "xltx",
  "slk",
  "dif",
  "ppt",
  "pptx",
  // OpenDocument
  "odt",
  "ott",
  "ods",
  "ots",
  "odp",
  "otp",
  "odg",
  "otg",
  // Text formats
  "txt",
  "text",
  "xml",
  "rtf",
  "html",
  "lwp",
  "md",
  // Images
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "pbm",
  "pgm",
  "ppm",
  "ras",
  "xbm",
  "xpm",
  "svg",
  "svm",
  "wmf",
  "webp",
  // StarOffice
  "sda",
  "sdc",
  "sdd",
  "sdw",
  "stc",
  "std",
  "sti",
  "stw",
  "sxd",
  "sxg",
  "sxi",
  "sxw",
  // Email formats
  "eml",
  // Archive formats
  "zip",
  // Other
  "dbf",
  "fods",
  "vsd",
  "vor",
  "vor3",
  "vor4",
  "uop",
  "pct",
  "ps",
  "pdf",
];

// Hook to get the translated tool registry
export function useFlatToolRegistry(): ToolRegistry {
  const { t } = useTranslation();

  return useMemo(() => {
    const allTools: ToolRegistry = {
      // Signing

      certSign: {
        icon: <LocalIcon icon="workspace-premium-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.certSign.title", "Certificate Sign"),
        component: ManageSignatures,
        description: t("home.certSign.desc", "Sign PDF documents using digital certificates"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING,
        maxFiles: -1,
        endpoints: ["cert-sign"],
        operationConfig: manageSignaturesOperationConfig,
        settingsComponent: CertificateTypeSettings,
      },
      sign: {
        icon: <LocalIcon icon="signature-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.sign.title", "Sign"),
        component: null,
        description: t("home.sign.desc", "Adds signature to PDF by drawing, text or image"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING,
      },

      // Document Security

      addPassword: {
        icon: <LocalIcon icon="password-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addPassword.title", "Add Password"),
        component: AddPassword,
        description: t("home.addPassword.desc", "Add password protection and restrictions to PDF files"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"],
        operationConfig: addPasswordOperationConfig,
        settingsComponent: AddPasswordSettings,
      },
      addWatermark: {
        icon: <LocalIcon icon="branding-watermark-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.watermark.title", "Add Watermark"),
        component: AddWatermark,
        maxFiles: -1,
        description: t("home.watermark.desc", "Add a custom watermark to your PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        endpoints: ["add-watermark"],
        operationConfig: addWatermarkOperationConfig,
        settingsComponent: AddWatermarkSingleStepSettings,
      },
      "add-stamp": {
        icon: <LocalIcon icon="approval-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.AddStampRequest.title", "Add Stamp to PDF"),
        component: null,
        description: t("home.AddStampRequest.desc", "Add text or add image stamps at set locations"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
      },
      sanitize: {
        icon: <LocalIcon icon="cleaning-services-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.sanitize.title", "Sanitize"),
        component: Sanitize,
        maxFiles: -1,
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        description: t("home.sanitize.desc", "Remove potentially harmful elements from PDF files"),
        endpoints: ["sanitize-pdf"],
        operationConfig: sanitizeOperationConfig,
        settingsComponent: SanitizeSettings,
      },
      flatten: {
        icon: <LocalIcon icon="layers-clear-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.flatten.title", "Flatten"),
        component: null,
        description: t("home.flatten.desc", "Remove all interactive elements and forms from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
      },
      "unlock-pdf-forms": {
        icon: <LocalIcon icon="preview-off-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.unlockPDFForms.title", "Unlock PDF Forms"),
        component: UnlockPdfForms,
        description: t("home.unlockPDFForms.desc", "Remove read-only property of form fields in a PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["unlock-pdf-forms"],
        operationConfig: unlockPdfFormsOperationConfig,
        settingsComponent: UnlockPdfFormsSettings,
      },
      "manage-certificates": {
        icon: <LocalIcon icon="license-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.manageCertificates.title", "Manage Certificates"),
        component: null,
        description: t(
          "home.manageCertificates.desc",
          "Import, export, or delete digital certificate files used for signing PDFs."
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
      },
      "change-permissions": {
        icon: <LocalIcon icon="lock-outline" width="1.5rem" height="1.5rem" />,
        name: t("home.changePermissions.title", "Change Permissions"),
        component: ChangePermissions,
        description: t("home.changePermissions.desc", "Change document restrictions and permissions"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"],
        operationConfig: changePermissionsOperationConfig,
        settingsComponent: ChangePermissionsSettings,
      },
      // Verification

      "validate-pdf-signature": {
        icon: <LocalIcon icon="verified-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.validateSignature.title", "Validate PDF Signature"),
        component: null,
        description: t("home.validateSignature.desc", "Verify digital signatures and certificates in PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
      },
      "get-all-info-on-pdf": {
        icon: <LocalIcon icon="fact-check-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.getPdfInfo.title", "Get ALL Info on PDF"),
        component: null,
        description: t("home.getPdfInfo.desc", "Grabs any and all information possible on PDFs"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
      },

      // Document Review

     read: {
        icon: <LocalIcon icon="article-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.read.title", "Read"),
        component: null,
        workbench: "viewer",
        description: t(
          "home.read.desc",
          "View and annotate PDFs. Highlight text, draw, or insert comments for review and collaboration."
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
      },
      "change-metadata": {
        icon: <LocalIcon icon="assignment-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.changeMetadata.title", "Change Metadata"),
        component: null,
        description: t("home.changeMetadata.desc", "Change/Remove/Add metadata from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
      },
      // Page Formatting

      cropPdf: {
        icon: <LocalIcon icon="crop-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.crop.title", "Crop PDF"),
        component: null,
        description: t("home.crop.desc", "Crop a PDF to reduce its size (maintains text!)"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      rotate: {
        icon: <LocalIcon icon="rotate-right-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.rotate.title", "Rotate"),
        component: null,
        description: t("home.rotate.desc", "Easily rotate your PDFs."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      split: {
        icon: <LocalIcon icon="content-cut-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.split.title", "Split"),
        component: SplitPdfPanel,
        description: t("home.split.desc", "Split PDFs into multiple documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        operationConfig: splitOperationConfig,
        settingsComponent: SplitSettings,
      },
      "reorganize-pages": {
        icon: <LocalIcon icon="move-down-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.reorganizePages.title", "Reorganize Pages"),
        component: null,
        workbench: "pageEditor",
        description: t(
          "home.reorganizePages.desc",
          "Rearrange, duplicate, or delete PDF pages with visual drag-and-drop control."
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      "adjust-page-size-scale": {
        icon: <LocalIcon icon="crop-free-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.scalePages.title", "Adjust page size/scale"),
        component: null,

        description: t("home.scalePages.desc", "Change the size/scale of a page and/or its contents."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      addPageNumbers: {
        icon: <LocalIcon icon="123-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addPageNumbers.title", "Add Page Numbers"),
        component: null,

        description: t("home.addPageNumbers.desc", "Add Page numbers throughout a document in a set location"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      "multi-page-layout": {
        icon: <LocalIcon icon="dashboard-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.pageLayout.title", "Multi-Page Layout"),
        component: null,

        description: t("home.pageLayout.desc", "Merge multiple pages of a PDF document into a single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      "booklet-imposition": {
        icon: <LocalIcon icon="menu-book-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.bookletImposition.title", "Booklet Imposition"),
        component: BookletImposition,
        operationConfig: bookletImpositionOperationConfig,
        settingsComponent: BookletImpositionSettings,
        description: t("home.bookletImposition.desc", "Create booklets with proper page ordering and multi-page layout for printing and binding"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      "single-large-page": {
        icon: <LocalIcon icon="looks-one-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.pdfToSinglePage.title", "PDF to Single Large Page"),
        component: SingleLargePage,

        description: t("home.pdfToSinglePage.desc", "Merges all PDF pages into one large single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["pdf-to-single-page"],
        operationConfig: singleLargePageOperationConfig,
      },
      "add-attachments": {
        icon: <LocalIcon icon="attachment-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.attachments.title", "Add Attachments"),
        component: null,

        description: t("home.attachments.desc", "Add or remove embedded files (attachments) to/from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },

      // Extraction

      "extract-page": {
        icon: <LocalIcon icon="upload-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.extractPages.title", "Extract Pages"),
        component: null,
        description: t("home.extractPages.desc", "Extract specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION,
      },
      "extract-images": {
        icon: <LocalIcon icon="filter-alt" width="1.5rem" height="1.5rem" />,
        name: t("home.extractImages.title", "Extract Images"),
        component: null,
        description: t("home.extractImages.desc", "Extract images from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION,
      },

      // Removal

      removePages: {
        icon: <LocalIcon icon="delete-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removePages.title", "Remove Pages"),
        component: null,
        description: t("home.removePages.desc", "Remove specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
      },
      "remove-blank-pages": {
        icon: <LocalIcon icon="scan-delete-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeBlanks.title", "Remove Blank Pages"),
        component: null,
        description: t("home.removeBlanks.desc", "Remove blank pages from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
      },
      "remove-annotations": {
        icon: <LocalIcon icon="thread-unread-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeAnnotations.title", "Remove Annotations"),
        component: null,
        description: t("home.removeAnnotations.desc", "Remove annotations and comments from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
      },
      "remove-image": {
        icon: <LocalIcon icon="remove-selection-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeImagePdf.title", "Remove Image"),
        component: null,
        description: t("home.removeImagePdf.desc", "Remove images from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
      },
      "remove-password": {
        icon: <LocalIcon icon="lock-open-right-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removePassword.title", "Remove Password"),
        component: RemovePassword,
        description: t("home.removePassword.desc", "Remove password protection from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        endpoints: ["remove-password"],
        maxFiles: -1,
        operationConfig: removePasswordOperationConfig,
        settingsComponent: RemovePasswordSettings,
      },
      "remove-certificate-sign": {
        icon: <LocalIcon icon="remove-moderator-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeCertSign.title", "Remove Certificate Sign"),
        component: RemoveCertificateSign,
        description: t("home.removeCertSign.desc", "Remove digital signature from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: -1,
        endpoints: ["remove-certificate-sign"],
        operationConfig: removeCertificateSignOperationConfig,
      },

      // Automation

      automate: {
        icon: <LocalIcon icon="automation-outline" width="1.5rem" height="1.5rem" />,
        name: t("home.automate.title", "Automate"),
        component: React.lazy(() => import("../tools/Automate")),
        description: t(
          "home.automate.desc",
          "Build multi-step workflows by chaining together PDF actions. Ideal for recurring tasks."
        ),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
        maxFiles: -1,
        supportedFormats: CONVERT_SUPPORTED_FORMATS,
        endpoints: ["handleData"],
      },
      "auto-rename-pdf-file": {
        icon: <LocalIcon icon="match-word-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.auto-rename.title", "Auto Rename PDF File"),
        component: null,
        description: t("home.auto-rename.desc", "Automatically rename PDF files based on their content"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
      },
      "auto-split-pages": {
        icon: <LocalIcon icon="split-scene-right-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.autoSplitPDF.title", "Auto Split Pages"),
        component: null,
        description: t("home.autoSplitPDF.desc", "Automatically split PDF pages based on content detection"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
      },
      "auto-split-by-size-count": {
        icon: <LocalIcon icon="content-cut-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.autoSizeSplitPDF.title", "Auto Split by Size/Count"),
        component: null,
        description: t("home.autoSizeSplitPDF.desc", "Automatically split PDFs by file size or page count"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
      },

      // Advanced Formatting

      "adjust-contrast": {
        icon: <LocalIcon icon="palette" width="1.5rem" height="1.5rem" />,
        name: t("home.adjustContrast.title", "Adjust Colors/Contrast"),
        component: null,
        description: t("home.adjustContrast.desc", "Adjust colors and contrast of PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      repair: {
        icon: <LocalIcon icon="build-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.repair.title", "Repair"),
        component: Repair,
        description: t("home.repair.desc", "Repair corrupted or damaged PDF files"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        maxFiles: -1,
        endpoints: ["repair"],
        operationConfig: repairOperationConfig,
        settingsComponent: RepairSettings,
      },
      "detect-split-scanned-photos": {
        icon: <LocalIcon icon="scanner-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.ScannerImageSplit.title", "Detect & Split Scanned Photos"),
        component: null,
        description: t("home.ScannerImageSplit.desc", "Detect and split scanned photos into separate pages"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      "overlay-pdfs": {
        icon: <LocalIcon icon="layers-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.overlay-pdfs.title", "Overlay PDFs"),
        component: null,
        description: t("home.overlay-pdfs.desc", "Overlay one PDF on top of another"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      "replace-and-invert-color": {
        icon: <LocalIcon icon="format-color-fill-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.replaceColorPdf.title", "Replace & Invert Color"),
        component: null,
        description: t("home.replaceColorPdf.desc", "Replace or invert colors in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      "add-image": {
        icon: <LocalIcon icon="image-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addImage.title", "Add Image"),
        component: null,
        description: t("home.addImage.desc", "Add images to PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      "edit-table-of-contents": {
        icon: <LocalIcon icon="bookmark-add-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.editTableOfContents.title", "Edit Table of Contents"),
        component: null,
        description: t("home.editTableOfContents.desc", "Add or edit bookmarks and table of contents in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },
      "scanner-effect": {
        icon: <LocalIcon icon="scanner-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.fakeScan.title", "Scanner Effect"),
        component: null,
        description: t("home.fakeScan.desc", "Create a PDF that looks like it was scanned"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
      },

      // Developer Tools

      "show-javascript": {
        icon: <LocalIcon icon="javascript-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.showJS.title", "Show JavaScript"),
        component: null,
        description: t("home.showJS.desc", "Extract and display JavaScript code from PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
      },
      "dev-api": {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devApi.title", "API"),
        component: null,
        description: t("home.devApi.desc", "Link to API documentation"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://stirlingpdf.io/swagger-ui/5.21.0/index.html",
      },
      "dev-folder-scanning": {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devFolderScanning.title", "Automated Folder Scanning"),
        component: null,
        description: t("home.devFolderScanning.desc", "Link to automated folder scanning guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Folder%20Scanning/",
      },
      "dev-sso-guide": {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devSsoGuide.title", "SSO Guide"),
        component: null,
        description: t("home.devSsoGuide.desc", "Link to SSO guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration",
      },
      "dev-airgapped": {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devAirgapped.title", "Air-gapped Setup"),
        component: null,
        description: t("home.devAirgapped.desc", "Link to air-gapped setup guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Pro/#activation",
      },

      // Recommended Tools
      compare: {
        icon: <LocalIcon icon="compare-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.compare.title", "Compare"),
        component: null,
        description: t("home.compare.desc", "Compare two PDF documents and highlight differences"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
      },
      compress: {
        icon: <LocalIcon icon="zoom-in-map-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.compress.title", "Compress"),
        component: CompressPdfPanel,
        description: t("home.compress.desc", "Compress PDFs to reduce their file size."),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        operationConfig: compressOperationConfig,
        settingsComponent: CompressSettings,
      },
      convert: {
        icon: <LocalIcon icon="sync-alt-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.convert.title", "Convert"),
        component: ConvertPanel,
        description: t("home.convert.desc", "Convert files to and from PDF format"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        supportedFormats: CONVERT_SUPPORTED_FORMATS,
        endpoints: [
          "pdf-to-img",
          "img-to-pdf",
          "pdf-to-word",
          "pdf-to-presentation",
          "pdf-to-text",
          "pdf-to-html",
          "pdf-to-xml",
          "html-to-pdf",
          "markdown-to-pdf",
          "file-to-pdf",
          "pdf-to-csv",
          "pdf-to-markdown",
          "pdf-to-pdfa",
          "eml-to-pdf",
        ],

        operationConfig: convertOperationConfig,
        settingsComponent: ConvertSettings,
      },
      mergePdfs: {
        icon: <LocalIcon icon="library-add-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.merge.title", "Merge"),
        component: null,

        description: t("home.merge.desc", "Merge multiple PDFs into a single document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
      },
      "multi-tool": {
        icon: <LocalIcon icon="dashboard-customize-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.multiTool.title", "Multi-Tool"),
        component: null,
        workbench: "pageEditor",
        description: t("home.multiTool.desc", "Use multiple tools on a single PDF document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
      },
      ocr: {
        icon: <LocalIcon icon="quick-reference-all-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.ocr.title", "OCR"),
        component: OCRPanel,
        description: t("home.ocr.desc", "Extract text from scanned PDFs using Optical Character Recognition"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        operationConfig: ocrOperationConfig,
        settingsComponent: OCRSettings,
      },
      redact: {
        icon: <LocalIcon icon="visibility-off-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.redact.title", "Redact"),
        component: null,
        description: t("home.redact.desc", "Permanently remove sensitive information from PDF documents"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
      },
    };

    if (showPlaceholderTools) {
      return allTools;
    }
    const filteredTools = Object.keys(allTools)
      .filter((key) => allTools[key as ToolId].component !== null || allTools[key as ToolId].link)
      .reduce((obj, key) => {
        obj[key as ToolId] = allTools[key as ToolId];
        return obj;
      }, {} as ToolRegistry);
    return filteredTools;
  }, [t]); // Only re-compute when translations change
}
