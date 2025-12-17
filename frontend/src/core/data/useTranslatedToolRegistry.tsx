import { useMemo } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
import { devApiLink } from "@app/constants/links";
import SplitPdfPanel from "@app/tools/Split";
import CompressPdfPanel from "@app/tools/Compress";
import OCRPanel from "@app/tools/OCR";
import ConvertPanel from "@app/tools/Convert";
import Sanitize from "@app/tools/Sanitize";
import AddPassword from "@app/tools/AddPassword";
import ChangePermissions from "@app/tools/ChangePermissions";
import RemoveBlanks from "@app/tools/RemoveBlanks";
import RemovePages from "@app/tools/RemovePages";
import ReorganizePages from "@app/tools/ReorganizePages";
import { reorganizePagesOperationConfig } from "@app/hooks/tools/reorganizePages/useReorganizePagesOperation";
import RemovePassword from "@app/tools/RemovePassword";
import {
  SubcategoryId,
  ToolCategoryId,
  ToolRegistry,
  RegularToolRegistry,
  SuperToolRegistry,
  LinkToolRegistry,
} from "@app/data/toolsTaxonomy";
import { isSuperToolId, isLinkToolId } from '@app/types/toolId';
import AdjustContrast from "@app/tools/AdjustContrast";
import AdjustContrastSingleStepSettings from "@app/components/tools/adjustContrast/AdjustContrastSingleStepSettings";
import { adjustContrastOperationConfig } from "@app/hooks/tools/adjustContrast/useAdjustContrastOperation";
import { getSynonyms } from "@app/utils/toolSynonyms";
import { useProprietaryToolRegistry } from "@app/data/useProprietaryToolRegistry";
import GetPdfInfo from "@app/tools/GetPdfInfo";
import AddWatermark from "@app/tools/AddWatermark";
import AddStamp from "@app/tools/AddStamp";
import AddAttachments from "@app/tools/AddAttachments";
import Merge from '@app/tools/Merge';
import EditTableOfContents from '@app/tools/EditTableOfContents';
import Repair from "@app/tools/Repair";
import AutoRename from "@app/tools/AutoRename";
import SingleLargePage from "@app/tools/SingleLargePage";
import PageLayout from "@app/tools/PageLayout";
import UnlockPdfForms from "@app/tools/UnlockPdfForms";
import RemoveCertificateSign from "@app/tools/RemoveCertificateSign";
import RemoveImage from "@app/tools/RemoveImage";
import CertSign from "@app/tools/CertSign";
import BookletImposition from "@app/tools/BookletImposition";
import Flatten from "@app/tools/Flatten";
import Rotate from "@app/tools/Rotate";
import PdfTextEditor from "@app/tools/pdfTextEditor/PdfTextEditor";
import ChangeMetadata from "@app/tools/ChangeMetadata";
import Crop from "@app/tools/Crop";
import Sign from "@app/tools/Sign";
import AddText from "@app/tools/AddText";
import AddImage from "@app/tools/AddImage";
import Annotate from "@app/tools/Annotate";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { splitOperationConfig } from "@app/hooks/tools/split/useSplitOperation";
import { addPasswordOperationConfig } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { removePasswordOperationConfig } from "@app/hooks/tools/removePassword/useRemovePasswordOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { repairOperationConfig } from "@app/hooks/tools/repair/useRepairOperation";
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { addStampOperationConfig } from "@app/components/tools/addStamp/useAddStampOperation";
import { addAttachmentsOperationConfig } from "@app/hooks/tools/addAttachments/useAddAttachmentsOperation";
import { unlockPdfFormsOperationConfig } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { singleLargePageOperationConfig } from "@app/hooks/tools/singleLargePage/useSingleLargePageOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { convertOperationConfig } from "@app/hooks/tools/convert/useConvertOperation";
import { removeCertificateSignOperationConfig } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import { changePermissionsOperationConfig } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { certSignOperationConfig } from "@app/hooks/tools/certSign/useCertSignOperation";
import { bookletImpositionOperationConfig } from "@app/hooks/tools/bookletImposition/useBookletImpositionOperation";
import { mergeOperationConfig } from '@app/hooks/tools/merge/useMergeOperation';
import { editTableOfContentsOperationConfig } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation';
import { autoRenameOperationConfig } from "@app/hooks/tools/autoRename/useAutoRenameOperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";
import { rotateOperationConfig } from "@app/hooks/tools/rotate/useRotateOperation";
import { changeMetadataOperationConfig } from "@app/hooks/tools/changeMetadata/useChangeMetadataOperation";
import { signOperationConfig } from "@app/hooks/tools/sign/useSignOperation";
import { cropOperationConfig } from "@app/hooks/tools/crop/useCropOperation";
import { removeAnnotationsOperationConfig } from "@app/hooks/tools/removeAnnotations/useRemoveAnnotationsOperation";
import { extractImagesOperationConfig } from "@app/hooks/tools/extractImages/useExtractImagesOperation";
import { replaceColorOperationConfig } from "@app/hooks/tools/replaceColor/useReplaceColorOperation";
import { removePagesOperationConfig } from "@app/hooks/tools/removePages/useRemovePagesOperation";
import { removeBlanksOperationConfig } from "@app/hooks/tools/removeBlanks/useRemoveBlanksOperation";
import { overlayPdfsOperationConfig } from "@app/hooks/tools/overlayPdfs/useOverlayPdfsOperation";
import { adjustPageScaleOperationConfig } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleOperation";
import { scannerImageSplitOperationConfig } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitOperation";
import { addPageNumbersOperationConfig } from "@app/components/tools/addPageNumbers/useAddPageNumbersOperation";
import { extractPagesOperationConfig } from "@app/hooks/tools/extractPages/useExtractPagesOperation";
import { ENDPOINTS as SPLIT_ENDPOINT_NAMES } from '@app/constants/splitConstants';
import CompressSettings from "@app/components/tools/compress/CompressSettings";
import AddPasswordSettings from "@app/components/tools/addPassword/AddPasswordSettings";
import RemovePasswordSettings from "@app/components/tools/removePassword/RemovePasswordSettings";
import SanitizeSettings from "@app/components/tools/sanitize/SanitizeSettings";
import AddWatermarkSingleStepSettings from "@app/components/tools/addWatermark/AddWatermarkSingleStepSettings";
import OCRSettings from "@app/components/tools/ocr/OCRSettings";
import ConvertSettings from "@app/components/tools/convert/ConvertSettings";
import ChangePermissionsSettings from "@app/components/tools/changePermissions/ChangePermissionsSettings";
import BookletImpositionSettings from "@app/components/tools/bookletImposition/BookletImpositionSettings";
import FlattenSettings from "@app/components/tools/flatten/FlattenSettings";
import RedactSingleStepSettings from "@app/components/tools/redact/RedactSingleStepSettings";
import Redact from "@app/tools/Redact";
import AdjustPageScale from "@app/tools/AdjustPageScale";
import ReplaceColor from "@app/tools/ReplaceColor";
import ScannerImageSplit from "@app/tools/ScannerImageSplit";
import OverlayPdfs from "@app/tools/OverlayPdfs";
import { ToolId } from "@app/types/toolId";
import MergeSettings from '@app/components/tools/merge/MergeSettings';
import AdjustPageScaleSettings from "@app/components/tools/adjustPageScale/AdjustPageScaleSettings";
import ScannerImageSplitSettings from "@app/components/tools/scannerImageSplit/ScannerImageSplitSettings";
import ChangeMetadataSingleStep from "@app/components/tools/changeMetadata/ChangeMetadataSingleStep";
import SignSettings from "@app/components/tools/sign/SignSettings";
import AddPageNumbers from "@app/tools/AddPageNumbers";
import RemoveAnnotations from "@app/tools/RemoveAnnotations";
import PageLayoutSettings from "@app/components/tools/pageLayout/PageLayoutSettings";
import ExtractImages from "@app/tools/ExtractImages";
import ExtractPages from "@app/tools/ExtractPages";
import ExtractImagesSettings from "@app/components/tools/extractImages/ExtractImagesSettings";
import ExtractPagesSettings from "@app/components/tools/extractPages/ExtractPagesSettings";
import ReplaceColorSettings from "@app/components/tools/replaceColor/ReplaceColorSettings";
import AddStampAutomationSettings from "@app/components/tools/addStamp/AddStampAutomationSettings";
import CertSignAutomationSettings from "@app/components/tools/certSign/CertSignAutomationSettings";
import CropAutomationSettings from "@app/components/tools/crop/CropAutomationSettings";
import RotateAutomationSettings from "@app/components/tools/rotate/RotateAutomationSettings";
import SplitAutomationSettings from "@app/components/tools/split/SplitAutomationSettings";
import AddAttachmentsSettings from "@app/components/tools/addAttachments/AddAttachmentsSettings";
import RemovePagesSettings from "@app/components/tools/removePages/RemovePagesSettings";
import RemoveBlanksSettings from "@app/components/tools/removeBlanks/RemoveBlanksSettings";
import AddPageNumbersAutomationSettings from "@app/components/tools/addPageNumbers/AddPageNumbersAutomationSettings";
import OverlayPdfsSettings from "@app/components/tools/overlayPdfs/OverlayPdfsSettings";
import ValidateSignature from "@app/tools/ValidateSignature";
import ShowJS from "@app/tools/ShowJS";
import Automate from "@app/tools/Automate";
import Compare from "@app/tools/Compare";
import { CONVERT_SUPPORTED_FORMATS } from "@app/constants/convertSupportedFornats";



export interface TranslatedToolCatalog {
  allTools: ToolRegistry;
  regularTools: RegularToolRegistry;
  superTools: SuperToolRegistry;
  linkTools: LinkToolRegistry;
}

// Hook to get the translated tool registry
export function useTranslatedToolCatalog(): TranslatedToolCatalog {
  const { t } = useTranslation();
  const proprietaryTools = useProprietaryToolRegistry();

  return useMemo(() => {
    const allTools: ToolRegistry = {
      // Proprietary tools (if any)
      ...proprietaryTools,
      // Recommended Tools in order
      pdfTextEditor: {
        icon: <LocalIcon icon="edit-square-outline-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.pdfTextEditor.title", "PDF Text Editor"),
        component: PdfTextEditor,
        description: t(
          "home.pdfTextEditor.desc",
          "Review and edit text and images in PDFs with grouped text editing and PDF regeneration"
        ),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: 1,
        endpoints: ["text-editor-pdf"],
        synonyms: getSynonyms(t, "pdfTextEditor"),
        supportsAutomate: false,
        automationSettings: null,
        versionStatus: "alpha",
      },
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
      addText: {
        icon: <LocalIcon icon="material-symbols:text-fields-rounded" width="1.5rem" height="1.5rem" />,
        name: t('home.addText.title', 'Add Text'),
        component: AddText,
        description: t('home.addText.desc', 'Add custom text anywhere in your PDF'),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        operationConfig: signOperationConfig,
        automationSettings: null,
        synonyms: getSynonyms(t, 'addText'),
        supportsAutomate: false,
      },
      addImage: {
        icon: <LocalIcon icon="image-rounded" width="1.5rem" height="1.5rem" />,
        name: t('home.addImage.title', 'Add Image'),
        component: AddImage,
        description: t('home.addImage.desc', 'Add images anywhere in your PDF'),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        operationConfig: signOperationConfig,
        automationSettings: null,
        synonyms: getSynonyms(t, 'addImage'),
        supportsAutomate: false,
      },
      annotate: {
        icon: <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />,
        name: t('home.annotate.title', 'Annotate'),
        component: Annotate,
        description: t('home.annotate.desc', 'Highlight, draw, add notes, and shapes directly in the viewer'),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        workbench: 'viewer',
        operationConfig: signOperationConfig,
        automationSettings: null,
        synonyms: getSynonyms(t, 'annotate'),
        supportsAutomate: false,
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
        component: GetPdfInfo,
        description: t("home.getPdfInfo.desc", "Grabs any and all information possible on PDFs"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
        endpoints: ["get-info-on-pdf"],
        synonyms: getSynonyms(t, "getPdfInfo"),
        supportsAutomate: false,
        automationSettings: null,
        maxFiles: 1,
      },
      validateSignature: {
        icon: <LocalIcon icon="verified-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.validateSignature.title", "Validate PDF Signature"),
        component: ValidateSignature,
        description: t("home.validateSignature.desc", "Verify digital signatures and certificates in PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION,
        maxFiles: -1,
        endpoints: ["validate-signature"],
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
      editTableOfContents: {
        icon: <LocalIcon icon="toc-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.editTableOfContents.title", "Edit Table of Contents"),
        component: EditTableOfContents,
        description: t(
          "home.editTableOfContents.desc",
          "Add or edit bookmarks and table of contents in PDF documents"
        ),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
        maxFiles: 1,
        endpoints: ["edit-table-of-contents"],
        operationConfig: editTableOfContentsOperationConfig,
        automationSettings: null,
        supportsAutomate: false,
        synonyms: getSynonyms(t, "editTableOfContents"),
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
        endpoints: Array.from(new Set(Object.values(SPLIT_ENDPOINT_NAMES))),
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
        endpoints: ["booklet-imposition"],
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
        component: ExtractPages,
        description: t("home.extractPages.desc", "Extract specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION,
        synonyms: getSynonyms(t, "extractPages"),
        automationSettings: ExtractPagesSettings,
        operationConfig: extractPagesOperationConfig,
        endpoints: ["rearrange-pages"],
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
        endpoints: ["remove-annotations"],
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
        endpoints: ["remove-cert-sign"],
        operationConfig: removeCertificateSignOperationConfig,
        synonyms: getSynonyms(t, "removeCertSign"),
        automationSettings: null,
      },

      // Automation

      automate: {
        icon: <LocalIcon icon="automation-outline" width="1.5rem" height="1.5rem" />,
        name: t("home.automate.title", "Automate"),
        component: Automate,
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
        endpoints: ["auto-rename"],
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
        component: AdjustContrast,
        description: t("home.adjustContrast.desc", "Adjust colors and contrast of PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        operationConfig: adjustContrastOperationConfig,
        automationSettings: AdjustContrastSingleStepSettings,
        synonyms: getSynonyms(t, "adjustContrast"),
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
        name: t("home.overlay-pdfs.title", "Overlay PDFs"),
        component: OverlayPdfs,
        description: t("home.overlay-pdfs.desc", "Overlay one PDF on top of another"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        endpoints: ["overlay-pdf"],
        operationConfig: overlayPdfsOperationConfig,
        synonyms: getSynonyms(t, "overlay-pdfs"),
        automationSettings: OverlayPdfsSettings
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
      scannerEffect: {
        icon: <LocalIcon icon="scanner-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.scannerEffect.title", "Scanner Effect"),
        component: null,
        description: t("home.scannerEffect.desc", "Create a PDF that looks like it was scanned"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        endpoints: ["scanner-effect"],
        synonyms: getSynonyms(t, "scannerEffect"),
        automationSettings: null
      },

      // Developer Tools

      showJS: {
        icon: <LocalIcon icon="javascript-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.showJS.title", "Show JavaScript"),
        component: ShowJS,
        description: t("home.showJS.desc", "Extract and display JavaScript code from PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        maxFiles: 1,
        endpoints: ["show-javascript"],
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
        link: devApiLink,
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
        component: Compare,
        description: t("home.compare.desc", "Compare two PDF documents and highlight differences"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: 2,
        operationConfig: undefined,
        automationSettings: null,
        synonyms: getSynonyms(t, "compare"),
        supportsAutomate: false
      },
      compress: {
        icon: <LocalIcon icon="zoom-in-map-rounded" width="1.5rem" height="1.5rem" />,
        name: t("home.compress.title", "Compress"),
        component: CompressPdfPanel,
        description: t("home.compress.desc", "Compress PDFs to reduce their file size."),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
        endpoints: ["compress-pdf"],
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
        endpoints: ["ocr-pdf"],
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

    const regularTools = {} as RegularToolRegistry;
    const superTools = {} as SuperToolRegistry;
    const linkTools = {} as LinkToolRegistry;

    Object.entries(allTools).forEach(([key, entry]) => {
      const toolId = key as ToolId;
      if (isSuperToolId(toolId)) {
        superTools[toolId] = entry;
      } else if (isLinkToolId(toolId)) {
        linkTools[toolId] = entry;
      } else {
        regularTools[toolId] = entry;
      }
    });

    return {
      allTools,
      regularTools,
      superTools,
      linkTools,
    };
  }, [t, proprietaryTools]); // Re-compute when translations or proprietary tools change
}
