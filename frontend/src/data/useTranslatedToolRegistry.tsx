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
import RemoveBlanks from "../tools/RemoveBlanks";
import RemovePages from "../tools/RemovePages";
import ReorganizePages from "../tools/ReorganizePages";
import { reorganizePagesOperationConfig } from "../hooks/tools/reorganizePages/useReorganizePagesOperation";
import RemovePassword from "../tools/RemovePassword";
import { SubcategoryId, ToolCategoryId, ToolRegistry } from "./toolsTaxonomy";
import { getSynonyms } from "../utils/toolSynonyms";
import AddWatermark from "../tools/AddWatermark";
import AddStamp from "../tools/AddStamp";
import AddAttachments from "../tools/AddAttachments";
import Merge from '../tools/Merge';
import Repair from "../tools/Repair";
import AutoRename from "../tools/AutoRename";
import SingleLargePage from "../tools/SingleLargePage";
import PageLayout from "../tools/PageLayout";
import UnlockPdfForms from "../tools/UnlockPdfForms";
import RemoveCertificateSign from "../tools/RemoveCertificateSign";
import RemoveImage from "../tools/RemoveImage";
import CertSign from "../tools/CertSign";
import BookletImposition from "../tools/BookletImposition";
import Flatten from "../tools/Flatten";
import Rotate from "../tools/Rotate";
import ChangeMetadata from "../tools/ChangeMetadata";
import Crop from "../tools/Crop";
import Sign from "../tools/Sign";
import { compressOperationConfig } from "../hooks/tools/compress/useCompressOperation";
import { splitOperationConfig } from "../hooks/tools/split/useSplitOperation";
import { addPasswordOperationConfig } from "../hooks/tools/addPassword/useAddPasswordOperation";
import { removePasswordOperationConfig } from "../hooks/tools/removePassword/useRemovePasswordOperation";
import { sanitizeOperationConfig } from "../hooks/tools/sanitize/useSanitizeOperation";
import { repairOperationConfig } from "../hooks/tools/repair/useRepairOperation";
import { addWatermarkOperationConfig } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import { addStampOperationConfig } from "../components/tools/addStamp/useAddStampOperation";
import { addAttachmentsOperationConfig } from "../hooks/tools/addAttachments/useAddAttachmentsOperation";
import { unlockPdfFormsOperationConfig } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { singleLargePageOperationConfig } from "../hooks/tools/singleLargePage/useSingleLargePageOperation";
import { ocrOperationConfig } from "../hooks/tools/ocr/useOCROperation";
import { convertOperationConfig } from "../hooks/tools/convert/useConvertOperation";
import { removeCertificateSignOperationConfig } from "../hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { changePermissionsOperationConfig } from "../hooks/tools/changePermissions/useChangePermissionsOperation";
import { certSignOperationConfig } from "../hooks/tools/certSign/useCertSignOperation";
import { bookletImpositionOperationConfig } from "../hooks/tools/bookletImposition/useBookletImpositionOperation";
import { mergeOperationConfig } from '../hooks/tools/merge/useMergeOperation';
import { autoRenameOperationConfig } from "../hooks/tools/autoRename/useAutoRenameOperation";
import { flattenOperationConfig } from "../hooks/tools/flatten/useFlattenOperation";
import { redactOperationConfig } from "../hooks/tools/redact/useRedactOperation";
import { rotateOperationConfig } from "../hooks/tools/rotate/useRotateOperation";
import { changeMetadataOperationConfig } from "../hooks/tools/changeMetadata/useChangeMetadataOperation";
import { signOperationConfig } from "../hooks/tools/sign/useSignOperation";
import { cropOperationConfig } from "../hooks/tools/crop/useCropOperation";
import { removeAnnotationsOperationConfig } from "../hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { extractImagesOperationConfig } from "../hooks/tools/extractImages/useExtractImagesOperation";
import { replaceColorOperationConfig } from "../hooks/tools/replaceColor/useReplaceColorOperation";
import { removePagesOperationConfig } from "../hooks/tools/removePages/useRemovePagesOperation";
import { removeBlanksOperationConfig } from "../hooks/tools/removeBlanks/useRemoveBlanksOperation";
import CompressSettings from "../components/tools/compress/CompressSettings";
import AddPasswordSettings from "../components/tools/addPassword/AddPasswordSettings";
import RemovePasswordSettings from "../components/tools/removePassword/RemovePasswordSettings";
import SanitizeSettings from "../components/tools/sanitize/SanitizeSettings";
import AddWatermarkSingleStepSettings from "../components/tools/addWatermark/AddWatermarkSingleStepSettings";
import OCRSettings from "../components/tools/ocr/OCRSettings";
import ConvertSettings from "../components/tools/convert/ConvertSettings";
import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";
import BookletImpositionSettings from "../components/tools/bookletImposition/BookletImpositionSettings";
import FlattenSettings from "../components/tools/flatten/FlattenSettings";
import RedactSingleStepSettings from "../components/tools/redact/RedactSingleStepSettings";
import Redact from "../tools/Redact";
import AdjustPageScale from "../tools/AdjustPageScale";
import ReplaceColor from "../tools/ReplaceColor";
import ScannerImageSplit from "../tools/ScannerImageSplit";
import { ToolId } from "../types/toolId";
import MergeSettings from '../components/tools/merge/MergeSettings';
import { adjustPageScaleOperationConfig } from "../hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { scannerImageSplitOperationConfig } from "../hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import AdjustPageScaleSettings from "../components/tools/adjustPageScale/AdjustPageScaleSettings";
import ScannerImageSplitSettings from "../components/tools/scannerImageSplit/ScannerImageSplitSettings";
import ChangeMetadataSingleStep from "../components/tools/changeMetadata/ChangeMetadataSingleStep";
import SignSettings from "../components/tools/sign/SignSettings";
import AddPageNumbers from "../tools/AddPageNumbers";
import { addPageNumbersOperationConfig } from "../components/tools/addPageNumbers/useAddPageNumbersOperation";
import RemoveAnnotations from "../tools/RemoveAnnotations";
import PageLayoutSettings from "../components/tools/pageLayout/PageLayoutSettings";
import ExtractImages from "../tools/ExtractImages";
import ExtractImagesSettings from "../components/tools/extractImages/ExtractImagesSettings";
import ReplaceColorSettings from "../components/tools/replaceColor/ReplaceColorSettings";
import AddStampAutomationSettings from "../components/tools/addStamp/AddStampAutomationSettings";
import CertSignAutomationSettings from "../components/tools/certSign/CertSignAutomationSettings";
import CropAutomationSettings from "../components/tools/crop/CropAutomationSettings";
import RotateAutomationSettings from "../components/tools/rotate/RotateAutomationSettings";
import SplitAutomationSettings from "../components/tools/split/SplitAutomationSettings";
import AddAttachmentsSettings from "../components/tools/addAttachments/AddAttachmentsSettings";
import RemovePagesSettings from "../components/tools/removePages/RemovePagesSettings";
import RemoveBlanksSettings from "../components/tools/removeBlanks/RemoveBlanksSettings";
import AddPageNumbersAutomationSettings from "../components/tools/addPageNumbers/AddPageNumbersAutomationSettings";

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
      // Recommended Tools in order
      multiTool: {
        icon: <LocalIcon icon="dashboard-customize-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.multiTool.title", "Multi-Tool"),
        component: null,
        workbench: "pageEditor",
        description: t("home.multiTool.desc", "Use multiple tools on a single PDF document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        synonyms: getSynonyms(t, "multiTool"),
        supportsAutomate: false,
        automationSettings: null
      },
      merge: {
        icon: <LocalIcon icon="library-add-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.merge.title", "Merge"),
        component: Merge,
        description: t("home.merge.desc", "Merge multiple PDFs into a single document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        endpoints: ["merge-pdfs"],
        operationConfig: mergeOperationConfig,
        automationSettings: MergeSettings,
        synonyms: getSynonyms(t, "merge")
      },
      // Signing
      certSign: {
        icon: <LocalIcon icon="workspace-premium-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.certSign.title", "Certificate Sign"),
        component: CertSign,
        description: t("home.certSign.desc", "Sign PDF documents using digital certificates"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING,
        synonyms: getSynonyms(t, "certSign"),
        maxFiles: -1,
        endpoints: ["cert-sign"],
        operationConfig: certSignOperationConfig,
        automationSettings: CertSignAutomationSettings,
      },
      sign: {
        icon: <LocalIcon icon="signature-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.sign.title", "Sign"),
        component: Sign,
        description: t("home.sign.desc", "Adds signature to PDF by drawing, text or image"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING,
        operationConfig: signOperationConfig,
        automationSettings: SignSettings, // TODO:: not all settings shown, suggested next tools shown
        synonyms: getSynonyms(t, "sign"),
        supportsAutomate: false, //TODO make support Sign
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
        automationSettings: AddPasswordSettings,
        synonyms: getSynonyms(t, "addPassword")
     },
      watermark: {
        icon: <LocalIcon icon="branding-watermark-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.watermark.title", "Add Watermark"),
        component: AddWatermark,
        maxFiles: -1,
        description: t("home.watermark.desc", "Add a custom watermark to your PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        endpoints: ["add-watermark"],
        operationConfig: addWatermarkOperationConfig,
        automationSettings: AddWatermarkSingleStepSettings,
        synonyms: getSynonyms(t, "watermark")
      },
      addStamp: {
        icon: <LocalIcon icon="approval-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addStamp.title", "Add Stamp to PDF"),
        component: AddStamp,
        description: t("home.addStamp.desc", "Add text or add image stamps at set locations"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        synonyms: getSynonyms(t, "addStamp"),
        maxFiles: -1,
        endpoints: ["add-stamp"],
        operationConfig: addStampOperationConfig,
        automationSettings: AddStampAutomationSettings,
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
        automationSettings: SanitizeSettings,
        synonyms: getSynonyms(t, "sanitize")
      },
      flatten: {
        icon: <LocalIcon icon="layers-clear-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.flatten.title", "Flatten"),
        component: Flatten,
        description: t("home.flatten.desc", "Remove all interactive elements and forms from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["flatten"],
        operationConfig: flattenOperationConfig,
        automationSettings: FlattenSettings,
        synonyms: getSynonyms(t, "flatten")
      },
      unlockPDFForms: {
        icon: <LocalIcon icon="preview-off-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.unlockPDFForms.title", "Unlock PDF Forms"),
        component: UnlockPdfForms,
        description: t("home.unlockPDFForms.desc", "Remove read-only property of form fields in a PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["unlock-pdf-forms"],
        operationConfig: unlockPdfFormsOperationConfig,
        synonyms: getSynonyms(t, "unlockPDFForms"),
        automationSettings: null
      },
      changePermissions: {
        icon: <LocalIcon icon="lock-outline" width="1.5rem" height="1.5rem" />,
        name: t("home.changePermissions.title", "Change Permissions"),
        component: ChangePermissions,
        description: t("home.changePermissions.desc", "Change document restrictions and permissions"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"],
        operationConfig: changePermissionsOperationConfig,
        automationSettings: ChangePermissionsSettings,
        synonyms: getSynonyms(t, "changePermissions"),
      },
      getPdfInfo: {
        icon: <LocalIcon icon="fact-check-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.getPdfInfo.title", "Get ALL Info on PDF"),
        component: null,
        description: t("home.getPdfInfo.desc", "Grabs any and all information possible on PDFs"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
        synonyms: getSynonyms(t, "getPdfInfo"),
        supportsAutomate: false,
        automationSettings: null
      },
      validateSignature: {
        icon: <LocalIcon icon="verified-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.validateSignature.title", "Validate PDF Signature"),
        component: null,
        description: t("home.validateSignature.desc", "Verify digital signatures and certificates in PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
        synonyms: getSynonyms(t, "validateSignature"),
        automationSettings: null
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
        synonyms: getSynonyms(t, "read"),
        supportsAutomate: false,
        automationSettings: null
      },
      changeMetadata: {
        icon: <LocalIcon icon="assignment-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.changeMetadata.title", "Change Metadata"),
        component: ChangeMetadata,
        description: t("home.changeMetadata.desc", "Change/Remove/Add metadata from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
        maxFiles: -1,
        endpoints: ["update-metadata"],
        operationConfig: changeMetadataOperationConfig,
        automationSettings: ChangeMetadataSingleStep,
        synonyms: getSynonyms(t, "changeMetadata")
      },
      // Page Formatting

      crop: {
        icon: <LocalIcon icon="crop-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.crop.title", "Crop PDF"),
        component: Crop,
        description: t("home.crop.desc", "Crop a PDF to reduce its size (maintains text!)"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["crop"],
        operationConfig: cropOperationConfig,
        automationSettings: CropAutomationSettings,
      },
      rotate: {
        icon: <LocalIcon icon="rotate-right-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.rotate.title", "Rotate"),
        component: Rotate,
        description: t("home.rotate.desc", "Easily rotate your PDFs."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["rotate-pdf"],
        operationConfig: rotateOperationConfig,
        automationSettings: RotateAutomationSettings,
        synonyms: getSynonyms(t, "rotate")
      },
      split: {
        icon: <LocalIcon icon="content-cut-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.split.title", "Split"),
        component: SplitPdfPanel,
        description: t("home.split.desc", "Split PDFs into multiple documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        operationConfig: splitOperationConfig,
        automationSettings: SplitAutomationSettings,
        synonyms: getSynonyms(t, "split")
      },
      reorganizePages: {
        icon: <LocalIcon icon="move-down-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.reorganizePages.title", "Reorganize Pages"),
        component: ReorganizePages,
        description: t(
          "home.reorganizePages.desc",
          "Rearrange, duplicate, or delete PDF pages with visual drag-and-drop control."
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        endpoints: ["rearrange-pages"],
        operationConfig: reorganizePagesOperationConfig,
        synonyms: getSynonyms(t, "reorganizePages"),
        automationSettings: null

      },
      scalePages: {
        icon: <LocalIcon icon="crop-free-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.scalePages.title", "Adjust page size/scale"),
        component: AdjustPageScale,
        description: t("home.scalePages.desc", "Change the size/scale of a page and/or its contents."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["scale-pages"],
        operationConfig: adjustPageScaleOperationConfig,
        automationSettings: AdjustPageScaleSettings,
        synonyms: getSynonyms(t, "scalePages")
      },
      addPageNumbers: {
        icon: <LocalIcon icon="123-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addPageNumbers.title", "Add Page Numbers"),
        component: AddPageNumbers,
        description: t("home.addPageNumbers.desc", "Add Page numbers throughout a document in a set location"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        automationSettings: AddPageNumbersAutomationSettings,
        maxFiles: -1,
        endpoints: ["add-page-numbers"],
        operationConfig: addPageNumbersOperationConfig,
        synonyms: getSynonyms(t, "addPageNumbers")
      },
      pageLayout: {
        icon: <LocalIcon icon="dashboard-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.pageLayout.title", "Multi-Page Layout"),
        component: PageLayout,
        description: t("home.pageLayout.desc", "Merge multiple pages of a PDF document into a single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["multi-page-layout"],
        automationSettings: PageLayoutSettings,
        synonyms: getSynonyms(t, "pageLayout")
      },
      bookletImposition: {
        icon: <LocalIcon icon="menu-book-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.bookletImposition.title", "Booklet Imposition"),
        component: BookletImposition,
        operationConfig: bookletImpositionOperationConfig,
        automationSettings: BookletImpositionSettings,
        description: t("home.bookletImposition.desc", "Create booklets with proper page ordering and multi-page layout for printing and binding"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
      },
      pdfToSinglePage: {

        icon: <LocalIcon icon="looks-one-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.pdfToSinglePage.title", "PDF to Single Large Page"),
        component: SingleLargePage,

        description: t("home.pdfToSinglePage.desc", "Merges all PDF pages into one large single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["pdf-to-single-page"],
        operationConfig: singleLargePageOperationConfig,
        synonyms: getSynonyms(t, "pdfToSinglePage"),
        automationSettings: null,
      },
      addAttachments: {
        icon: <LocalIcon icon="attachment-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addAttachments.title", "Add Attachments"),
        component: AddAttachments,
        description: t("home.addAttachments.desc", "Add or remove embedded files (attachments) to/from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        synonyms: getSynonyms(t, "addAttachments"),
        maxFiles: 1,
        endpoints: ["add-attachments"],
        operationConfig: addAttachmentsOperationConfig,
        automationSettings: AddAttachmentsSettings,
      },

      // Extraction

      extractPages: {
        icon: <LocalIcon icon="upload-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.extractPages.title", "Extract Pages"),
        component: null,
        description: t("home.extractPages.desc", "Extract specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION,
        synonyms: getSynonyms(t, "extractPages"),
        automationSettings: null,
      },
      extractImages: {
        icon: <LocalIcon icon="photo-library-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.extractImages.title", "Extract Images"),
        component: ExtractImages,
        description: t("home.extractImages.desc", "Extract images from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION,
        maxFiles: -1,
        endpoints: ["extract-images"],
        operationConfig: extractImagesOperationConfig,
        automationSettings: ExtractImagesSettings,
        synonyms: getSynonyms(t, "extractImages")
      },

      // Removal

      removePages: {
        icon: <LocalIcon icon="delete-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removePages.title", "Remove Pages"),
        component: RemovePages,
        description: t("home.removePages.desc", "Remove specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: 1,
        endpoints: ["remove-pages"],
        synonyms: getSynonyms(t, "removePages"),
        operationConfig: removePagesOperationConfig,
        automationSettings: RemovePagesSettings,
      },
      removeBlanks: {
        icon: <LocalIcon icon="scan-delete-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeBlanks.title", "Remove Blank Pages"),
        component: RemoveBlanks,
        description: t("home.removeBlanks.desc", "Remove blank pages from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: 1,
        endpoints: ["remove-blanks"],
        synonyms: getSynonyms(t, "removeBlanks"),
        operationConfig: removeBlanksOperationConfig,
        automationSettings: RemoveBlanksSettings,
      },
      removeAnnotations: {
        icon: <LocalIcon icon="thread-unread-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeAnnotations.title", "Remove Annotations"),
        component: RemoveAnnotations,
        description: t("home.removeAnnotations.desc", "Remove annotations and comments from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: -1,
        operationConfig: removeAnnotationsOperationConfig,
        automationSettings: null,
        synonyms: getSynonyms(t, "removeAnnotations")
      },
      removeImage: {
        icon: <LocalIcon icon="remove-selection-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeImage.title", "Remove Images"),
        component: RemoveImage,
        description: t("home.removeImage.desc", "Remove all images from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: -1,
        endpoints: ["remove-image-pdf"],
        operationConfig: undefined,
        synonyms: getSynonyms(t, "removeImage"),
        automationSettings: null,
      },
      removePassword: {
        icon: <LocalIcon icon="lock-open-right-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removePassword.title", "Remove Password"),
        component: RemovePassword,
        description: t("home.removePassword.desc", "Remove password protection from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        endpoints: ["remove-password"],
        maxFiles: -1,
        operationConfig: removePasswordOperationConfig,
        automationSettings: RemovePasswordSettings,
        synonyms: getSynonyms(t, "removePassword")
      },
      removeCertSign: {
        icon: <LocalIcon icon="remove-moderator-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.removeCertSign.title", "Remove Certificate Sign"),
        component: RemoveCertificateSign,
        description: t("home.removeCertSign.desc", "Remove digital signature from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: -1,
        endpoints: ["remove-certificate-sign"],
        operationConfig: removeCertificateSignOperationConfig,
        synonyms: getSynonyms(t, "removeCertSign"),
        automationSettings: null,
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
        synonyms: getSynonyms(t, "automate"),
        automationSettings: null,
      },
      autoRename: {
        icon: <LocalIcon icon="match-word-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.autoRename.title", "Auto Rename PDF File"),
        component: AutoRename,
        maxFiles: -1,
        endpoints: ["remove-certificate-sign"],
        operationConfig: autoRenameOperationConfig,
        description: t("home.autoRename.desc", "Automatically rename PDF files based on their content"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION,
        synonyms: getSynonyms(t, "autoRename"),
        automationSettings: null,
      },

      // Advanced Formatting

      adjustContrast: {
        icon: <LocalIcon icon="palette" width="1.5rem" height="1.5rem" />,
        name: t("home.adjustContrast.title", "Adjust Colors/Contrast"),
        component: null,
        description: t("home.adjustContrast.desc", "Adjust colors and contrast of PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        synonyms: getSynonyms(t, "adjustContrast"),
        automationSettings: null,
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
        synonyms: getSynonyms(t, "repair"),
        automationSettings: null
      },
      scannerImageSplit: {
        icon: <LocalIcon icon="scanner-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.scannerImageSplit.title", "Detect & Split Scanned Photos"),
        component: ScannerImageSplit,
        description: t("home.scannerImageSplit.desc", "Detect and split scanned photos into separate pages"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        maxFiles: -1,
        endpoints: ["extract-image-scans"],
        operationConfig: scannerImageSplitOperationConfig,
        automationSettings: ScannerImageSplitSettings,
        synonyms: getSynonyms(t, "ScannerImageSplit"),
      },
      overlayPdfs: {
        icon: <LocalIcon icon="layers-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.overlayPdfs.title", "Overlay PDFs"),
        component: null,
        description: t("home.overlayPdfs.desc", "Overlay one PDF on top of another"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        synonyms: getSynonyms(t, "overlayPdfs"),
        automationSettings: null
      },
      replaceColor: {
        icon: <LocalIcon icon="format-color-fill-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.replaceColor.title", "Replace & Invert Color"),
        component: ReplaceColor,
        description: t("home.replaceColor.desc", "Replace or invert colors in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        maxFiles: -1,
        endpoints: ["replace-invert-pdf"],
        operationConfig: replaceColorOperationConfig,
        automationSettings: ReplaceColorSettings,
        synonyms: getSynonyms(t, "replaceColor"),
      },
      addImage: {
        icon: <LocalIcon icon="image-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.addImage.title", "Add Image"),
        component: null,
        description: t("home.addImage.desc", "Add images to PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        synonyms: getSynonyms(t, "addImage"),
        automationSettings: null
      },
      editTableOfContents: {
        icon: <LocalIcon icon="bookmark-add-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.editTableOfContents.title", "Edit Table of Contents"),
        component: null,
        description: t("home.editTableOfContents.desc", "Add or edit bookmarks and table of contents in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        synonyms: getSynonyms(t, "editTableOfContents"),
        automationSettings: null
      },
      scannerEffect: {
        icon: <LocalIcon icon="scanner-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.scannerEffect.title", "Scanner Effect"),
        component: null,
        description: t("home.scannerEffect.desc", "Create a PDF that looks like it was scanned"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        synonyms: getSynonyms(t, "scannerEffect"),
        automationSettings: null
      },

      // Developer Tools

      showJS: {
        icon: <LocalIcon icon="javascript-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.showJS.title", "Show JavaScript"),
        component: null,
        description: t("home.showJS.desc", "Extract and display JavaScript code from PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        synonyms: getSynonyms(t, "showJS"),
        supportsAutomate: false,
        automationSettings: null
      },
      devApi: {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devApi.title", "API"),
        component: null,
        description: t("home.devApi.desc", "Link to API documentation"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://stirlingpdf.io/swagger-ui/5.21.0/index.html",
        synonyms: getSynonyms(t, "devApi"),
        supportsAutomate: false,
        automationSettings: null
      },
      devFolderScanning: {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devFolderScanning.title", "Automated Folder Scanning"),
        component: null,
        description: t("home.devFolderScanning.desc", "Link to automated folder scanning guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Folder%20Scanning/",
        synonyms: getSynonyms(t, "devFolderScanning"),
        supportsAutomate: false,
        automationSettings: null
      },
      devSsoGuide: {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devSsoGuide.title", "SSO Guide"),
        component: null,
        description: t("home.devSsoGuide.desc", "Link to SSO guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration",
        synonyms: getSynonyms(t, "devSsoGuide"),
        supportsAutomate: false,
        automationSettings: null
      },
      devAirgapped: {
        icon: <LocalIcon icon="open-in-new-rounded" width="1.5rem" height="1.5rem" style={{ color: "#2F7BF6" }} />,
        name: t("home.devAirgapped.title", "Air-gapped Setup"),
        component: null,
        description: t("home.devAirgapped.desc", "Link to air-gapped setup guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Pro/#activation",
        synonyms: getSynonyms(t, "devAirgapped"),
        supportsAutomate: false,
        automationSettings: null
      },

      // Recommended Tools
      compare: {
        icon: <LocalIcon icon="compare-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.compare.title", "Compare"),
        component: null,
        description: t("home.compare.desc", "Compare two PDF documents and highlight differences"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        synonyms: getSynonyms(t, "compare"),
        supportsAutomate: false,
        automationSettings: null
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
        automationSettings: CompressSettings,
        synonyms: getSynonyms(t, "compress")
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
        automationSettings: ConvertSettings,
        synonyms: getSynonyms(t, "convert")
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
        automationSettings: OCRSettings,
        synonyms: getSynonyms(t, "ocr")
      },
      redact: {
        icon: <LocalIcon icon="visibility-off-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.redact.title", "Redact"),
        component: Redact,
        description: t("home.redact.desc", "Permanently remove sensitive information from PDF documents"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        endpoints: ["auto-redact"],
        operationConfig: redactOperationConfig,
        automationSettings: RedactSingleStepSettings,
        synonyms: getSynonyms(t, "redact")
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
