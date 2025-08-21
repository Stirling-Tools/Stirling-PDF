import { useTranslation } from 'react-i18next';
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import OCRPanel from '../tools/OCR';
import ConvertPanel from '../tools/Convert';
import Sanitize from '../tools/Sanitize';
import AddPassword from '../tools/AddPassword';
import ChangePermissions from '../tools/ChangePermissions';
import RemovePassword from '../tools/RemovePassword';
import { SubcategoryId, ToolCategoryId, ToolId, ToolRegistry } from './toolsTaxonomy';
import AddWatermark from '../tools/AddWatermark';
import Repair from '../tools/Repair';
import SingleLargePage from '../tools/SingleLargePage';
import UnlockPdfForms from '../tools/UnlockPdfForms';
import RemoveCertificateSign from '../tools/RemoveCertificateSign';

const showPlaceholderTools = false; // For development purposes. Allows seeing the full list of tools, even if they're unimplemented

// Hook to get the translated tool registry
export function useFlatToolRegistry(): ToolRegistry {
  const { t } = useTranslation();

  const allTools: ToolRegistry = {
    // Signing

    [ToolId.CERT_SIGN]: {
        icon: <span className="material-symbols-rounded">workspace_premium</span>,
        name: t("home.certSign.title", "Sign with Certificate"),
        component: null,
        view: "sign",
        description: t("home.certSign.desc", "Signs a PDF with a Certificate/Key (PEM/P12)"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING
    },
    [ToolId.SIGN]: {
        icon: <span className="material-symbols-rounded">signature</span>,
        name: t("home.sign.title", "Sign"),
        component: null,
        view: "sign",
        description: t("home.sign.desc", "Adds signature to PDF by drawing, text or image"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.SIGNING
    },


    // Document Security

    [ToolId.ADD_PASSWORD]: {
        icon: <span className="material-symbols-rounded">password</span>,
        name: t("home.addPassword.title", "Add Password"),
        component: AddPassword,
        view: "security",
        description: t("home.addPassword.desc", "Add password protection and restrictions to PDF files"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"]
    },
    [ToolId.WATERMARK]: {
        icon: <span className="material-symbols-rounded">branding_watermark</span>,
        name: t("home.watermark.title", "Add Watermark"),
        component: AddWatermark,
        view: "format",
        maxFiles: -1,
        description: t("home.watermark.desc", "Add a custom watermark to your PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        endpoints: ["add-watermark"]
    },
    [ToolId.ADD_STAMP]: {
        icon: <span className="material-symbols-rounded">approval</span>,
        name: t("home.AddStampRequest.title", "Add Stamp to PDF"),
        component: null,
        view: "format",
        description: t("home.AddStampRequest.desc", "Add text or add image stamps at set locations"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY
    },
    [ToolId.SANITIZE]: {
        icon: <span className="material-symbols-rounded">cleaning_services</span>,
        name: t("home.sanitize.title", "Sanitize"),
        component: Sanitize,
        view: "security",
        maxFiles: -1,
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        description: t("home.sanitize.desc", "Remove potentially harmful elements from PDF files"),
        endpoints: ["sanitize-pdf"]
    },
    [ToolId.FLATTEN]: {
        icon: <span className="material-symbols-rounded">layers_clear</span>,
        name: t("home.flatten.title", "Flatten"),
        component: null,
        view: "format",
        description: t("home.flatten.desc", "Remove all interactive elements and forms from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY
    },
    [ToolId.UNLOCK_PDF_FORMS]: {
        icon: <span className="material-symbols-rounded">preview_off</span>,
        name: t("home.unlockPDFForms.title", "Unlock PDF Forms"),
        component: UnlockPdfForms,
        view: "security",
        description: t("home.unlockPDFForms.desc", "Remove read-only property of form fields in a PDF document."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["unlock-pdf-forms"]
    },
    [ToolId.MANAGE_CERTIFICATES]: {
        icon: <span className="material-symbols-rounded">license</span>,
        name: t("home.manageCertificates.title", "Manage Certificates"),
        component: null,
        view: "security",
        description: t("home.manageCertificates.desc", "Import, export, or delete digital certificate files used for signing PDFs."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY
    },
    [ToolId.CHANGE_PERMISSIONS]: {
        icon: <span className="material-symbols-rounded">lock</span>,
        name: t("home.changePermissions.title", "Change Permissions"),
        component: ChangePermissions,
        view: "security",
        description: t("home.changePermissions.desc", "Change document restrictions and permissions"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"]
    },
    // Verification

    [ToolId.GET_ALL_INFO_ON_PDF]: {
        icon: <span className="material-symbols-rounded">fact_check</span>,
        name: t("home.getPdfInfo.title", "Get ALL Info on PDF"),
        component: null,
        view: "extract",
        description: t("home.getPdfInfo.desc", "Grabs any and all information possible on PDFs"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION
    },
    [ToolId.VALIDATE_PDF_SIGNATURE]: {
        icon: <span className="material-symbols-rounded">verified</span>,
        name: t("home.validateSignature.title", "Validate PDF Signature"),
        component: null,
        view: "security",
        description: t("home.validateSignature.desc", "Verify digital signatures and certificates in PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.VERIFICATION
    },


    // Document Review

    [ToolId.READ]: {
        icon: <span className="material-symbols-rounded">article</span>,
        name: t("home.read.title", "Read"),
        component: null,
        view: "view",
        description: t("home.read.desc", "View and annotate PDFs. Highlight text, draw, or insert comments for review and collaboration."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW
    },
    [ToolId.CHANGE_METADATA]: {
        icon: <span className="material-symbols-rounded">assignment</span>,
        name: t("home.changeMetadata.title", "Change Metadata"),
        component: null,
        view: "format",
        description: t("home.changeMetadata.desc", "Change/Remove/Add metadata from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.DOCUMENT_REVIEW
    },
    // Page Formatting

    [ToolId.CROP_PDF]: {
        icon: <span className="material-symbols-rounded">crop</span>,
        name: t("home.crop.title", "Crop PDF"),
        component: null,
        view: "format",
        description: t("home.crop.desc", "Crop a PDF to reduce its size (maintains text!)"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.ROTATE]: {
        icon: <span className="material-symbols-rounded">rotate_right</span>,
        name: t("home.rotate.title", "Rotate"),
        component: null,
        view: "format",
        description: t("home.rotate.desc", "Easily rotate your PDFs."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.SPLIT_PDF]: {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: t("home.split.title", "Split"),
        component: SplitPdfPanel,
        view: "split",
        description: t("home.split.desc", "Split PDFs into multiple documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.REORGANIZE_PAGES]: {
        icon: <span className="material-symbols-rounded">move_down</span>,
        name: t("home.reorganizePages.title", "Reorganize Pages"),
        component: null,
        view: "pageEditor",
        description: t("home.reorganizePages.desc", "Rearrange, duplicate, or delete PDF pages with visual drag-and-drop control."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.ADJUST_PAGE_SIZE_SCALE]: {
        icon: <span className="material-symbols-rounded">crop_free</span>,
        name: t("home.scalePages.title", "Adjust page size/scale"),
        component: null,
        view: "format",
        description: t("home.scalePages.desc", "Change the size/scale of a page and/or its contents."),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.ADD_PAGE_NUMBERS]: {
        icon: <span className="material-symbols-rounded">123</span>,
        name: t("home.addPageNumbers.title", "Add Page Numbers"),
        component: null,
        view: "format",
        description: t("home.addPageNumbers.desc", "Add Page numbers throughout a document in a set location"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.MULTI_PAGE_LAYOUT]: {
        icon: <span className="material-symbols-rounded">dashboard</span>,
        name: t("home.pageLayout.title", "Multi-Page Layout"),
        component: null,
        view: "format",
        description: t("home.pageLayout.desc", "Merge multiple pages of a PDF document into a single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING
    },
    [ToolId.SINGLE_LARGE_PAGE]: {
        icon: <span className="material-symbols-rounded">looks_one</span>,
        name: t("home.pdfToSinglePage.title", "PDF to Single Large Page"),
        component: SingleLargePage,
        view: "format",
        description: t("home.pdfToSinglePage.desc", "Merges all PDF pages into one large single page"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
        maxFiles: -1,
        endpoints: ["pdf-to-single-page"]
    },
    [ToolId.ADD_ATTACHMENTS]: {
        icon: <span className="material-symbols-rounded">attachment</span>,
        name: t("home.attachments.title", "Add Attachments"),
        component: null,
        view: "format",
        description: t("home.attachments.desc", "Add or remove embedded files (attachments) to/from a PDF"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.PAGE_FORMATTING,
    },


    // Extraction

    [ToolId.EXTRACT_PAGES]: {
        icon: <span className="material-symbols-rounded">upload</span>,
        name: t("home.extractPages.title", "Extract Pages"),
        component: null,
        view: "extract",
        description: t("home.extractPages.desc", "Extract specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION
    },
    [ToolId.EXTRACT_IMAGES]: {
        icon: <span className="material-symbols-rounded">filter</span>,
        name: t("home.extractImages.title", "Extract Images"),
        component: null,
        view: "extract",
        description: t("home.extractImages.desc", "Extract images from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.EXTRACTION
    },


    // Removal

    [ToolId.REMOVE_PAGES]: {
        icon: <span className="material-symbols-rounded">delete</span>,
        name: t("home.removePages.title", "Remove Pages"),
        component: null,
        view: "remove",
        description: t("home.removePages.desc", "Remove specific pages from a PDF document"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL
    },
    [ToolId.REMOVE_BLANK_PAGES]: {
        icon: <span className="material-symbols-rounded">scan_delete</span>,
        name: t("home.removeBlanks.title", "Remove Blank Pages"),
        component: null,
        view: "remove",
        description: t("home.removeBlanks.desc", "Remove blank pages from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL
    },
    [ToolId.REMOVE_ANNOTATIONS]: {
        icon: <span className="material-symbols-rounded">thread_unread</span>,
        name: t("home.removeAnnotations.title", "Remove Annotations"),
        component: null,
        view: "remove",
        description: t("home.removeAnnotations.desc", "Remove annotations and comments from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL
    },
    [ToolId.REMOVE_IMAGE]: {
        icon: <span className="material-symbols-rounded">remove_selection</span>,
        name: t("home.removeImagePdf.title", "Remove Image"),
        component: null,
        view: "format",
        description: t("home.removeImagePdf.desc", "Remove images from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL
    },
    [ToolId.REMOVE_PASSWORD]: {
        icon: <span className="material-symbols-rounded">lock_open_right</span>,
        name: t("home.removePassword.title", "Remove Password"),
        component: RemovePassword,
        view: "security",
        description: t("home.removePassword.desc", "Remove password protection from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        endpoints: ["remove-password"],
        maxFiles: -1,

    },
    [ToolId.REMOVE_CERTIFICATE_SIGN]: {
        icon: <span className="material-symbols-rounded">remove_moderator</span>,
        name: t("home.removeCertSign.title", "Remove Certificate Sign"),
        component: RemoveCertificateSign,
        view: "security",
        description: t("home.removeCertSign.desc", "Remove digital signature from PDF documents"),
        categoryId: ToolCategoryId.STANDARD_TOOLS,
        subcategoryId: SubcategoryId.REMOVAL,
        maxFiles: -1,
        endpoints: ["remove-certificate-sign"]
    },


    // Automation

    [ToolId.AUTOMATE]: {
        icon: <span className="material-symbols-rounded">automation</span>,
        name: t("home.automate.title", "Automate"),
        component: null,
        view: "format",
        description: t("home.automate.desc", "Build multi-step workflows by chaining together PDF actions. Ideal for recurring tasks."),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION
    },
    [ToolId.AUTO_RENAME_PDF_FILE]: {
        icon: <span className="material-symbols-rounded">match_word</span>,
        name: t("home.auto-rename.title", "Auto Rename PDF File"),
        component: null,
        view: "format",
        description: t("home.auto-rename.desc", "Automatically rename PDF files based on their content"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION
    },
    [ToolId.AUTO_SPLIT_PAGES]: {
        icon: <span className="material-symbols-rounded">split_scene_right</span>,
        name: t("home.autoSplitPDF.title", "Auto Split Pages"),
        component: null,
        view: "format",
        description: t("home.autoSplitPDF.desc", "Automatically split PDF pages based on content detection"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION
    },
    [ToolId.AUTO_SPLIT_BY_SIZE_COUNT]: {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: t("home.autoSizeSplitPDF.title", "Auto Split by Size/Count"),
        component: null,
        view: "format",
        description: t("home.autoSizeSplitPDF.desc", "Automatically split PDFs by file size or page count"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.AUTOMATION
    },


    // Advanced Formatting

    [ToolId.ADJUST_CONTRAST]: {
        icon: <span className="material-symbols-rounded">palette</span>,
        name: t("home.adjustContrast.title", "Adjust Colors/Contrast"),
        component: null,
        view: "format",
        description: t("home.adjustContrast.desc", "Adjust colors and contrast of PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.REPAIR]: {
        icon: <span className="material-symbols-rounded">build</span>,
        name: t("home.repair.title", "Repair"),
        component: Repair,
        view: "format",
        description: t("home.repair.desc", "Repair corrupted or damaged PDF files"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING,
        maxFiles: -1,
        endpoints: ["repair"]
    },
    [ToolId.DETECT_SPLIT_SCANNED_PHOTOS]: {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: t("home.ScannerImageSplit.title", "Detect & Split Scanned Photos"),
        component: null,
        view: "format",
        description: t("home.ScannerImageSplit.desc", "Detect and split scanned photos into separate pages"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.OVERLAY_PDFS]: {
        icon: <span className="material-symbols-rounded">layers</span>,
        name: t("home.overlay-pdfs.title", "Overlay PDFs"),
        component: null,
        view: "format",
        description: t("home.overlay-pdfs.desc", "Overlay one PDF on top of another"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.REPLACE_AND_INVERT_COLOR]: {
        icon: <span className="material-symbols-rounded">format_color_fill</span>,
        name: t("home.replaceColorPdf.title", "Replace & Invert Color"),
        component: null,
        view: "format",
        description: t("home.replaceColorPdf.desc", "Replace or invert colors in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.ADD_IMAGE]: {
        icon: <span className="material-symbols-rounded">image</span>,
        name: t("home.addImage.title", "Add Image"),
        component: null,
        view: "format",
        description: t("home.addImage.desc", "Add images to PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.EDIT_TABLE_OF_CONTENTS]: {
        icon: <span className="material-symbols-rounded">bookmark_add</span>,
        name: t("home.editTableOfContents.title", "Edit Table of Contents"),
        component: null,
        view: "format",
        description: t("home.editTableOfContents.desc", "Add or edit bookmarks and table of contents in PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },
    [ToolId.SCANNER_EFFECT]: {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: t("home.fakeScan.title", "Scanner Effect"),
        component: null,
        view: "format",
        description: t("home.fakeScan.desc", "Create a PDF that looks like it was scanned"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.ADVANCED_FORMATTING
    },


    // Developer Tools

    [ToolId.SHOW_JAVASCRIPT]: {
        icon: <span className="material-symbols-rounded">javascript</span>,
        name: t("home.showJS.title", "Show JavaScript"),
        component: null,
        view: "extract",
        description: t("home.showJS.desc", "Extract and display JavaScript code from PDF documents"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS
    },
    [ToolId.DEV_API]: {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devApi.title", "API"),
        component: null,
        view: "external",
        description: t("home.devApi.desc", "Link to API documentation"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://stirlingpdf.io/swagger-ui/5.21.0/index.html"
    },
    [ToolId.DEV_FOLDER_SCANNING]: {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devFolderScanning.title", "Automated Folder Scanning"),
        component: null,
        view: "external",
        description: t("home.devFolderScanning.desc", "Link to automated folder scanning guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Folder%20Scanning/"
    },
    [ToolId.DEV_SSO_GUIDE]: {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devSsoGuide.title", "SSO Guide"),
        component: null,
        view: "external",
        description: t("home.devSsoGuide.desc", "Link to SSO guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration",
    },
    [ToolId.DEV_AIRGAPPED]: {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devAirgapped.title", "Air-gapped Setup"),
        component: null,
        view: "external",
        description: t("home.devAirgapped.desc", "Link to air-gapped setup guide"),
        categoryId: ToolCategoryId.ADVANCED_TOOLS,
        subcategoryId: SubcategoryId.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Pro/#activation"
    },


    // Recommended Tools
    [ToolId.COMPARE]: {
        icon: <span className="material-symbols-rounded">compare</span>,
        name: t("home.compare.title", "Compare"),
        component: null,
        view: "format",
        description: t("home.compare.desc", "Compare two PDF documents and highlight differences"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL
    },
    [ToolId.COMPRESS]: {
        icon: <span className="material-symbols-rounded">zoom_in_map</span>,
        name: t("home.compress.title", "Compress"),
        component: CompressPdfPanel,
        view: "compress",
        description: t("home.compress.desc", "Compress PDFs to reduce their file size."),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1
    },
    [ToolId.CONVERT]: {
        icon: <span className="material-symbols-rounded">sync_alt</span>,
        name: t("home.convert.title", "Convert"),
        component: ConvertPanel,
        view: "convert",
        description: t("home.convert.desc", "Convert files to and from PDF format"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1,
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
            "eml-to-pdf"
        ],
        supportedFormats: [
            // Microsoft Office
            "doc", "docx", "dot", "dotx", "csv", "xls", "xlsx", "xlt", "xltx", "slk", "dif", "ppt", "pptx",
            // OpenDocument
            "odt", "ott", "ods", "ots", "odp", "otp", "odg", "otg",
            // Text formats
            "txt", "text", "xml", "rtf", "html", "lwp", "md",
            // Images
            "bmp", "gif", "jpeg", "jpg", "png", "tif", "tiff", "pbm", "pgm", "ppm", "ras", "xbm", "xpm", "svg", "svm", "wmf", "webp",
            // StarOffice
            "sda", "sdc", "sdd", "sdw", "stc", "std", "sti", "stw", "sxd", "sxg", "sxi", "sxw",
            // Email formats
            "eml",
            // Archive formats
            "zip",
            // Other
            "dbf", "fods", "vsd", "vor", "vor3", "vor4", "uop", "pct", "ps", "pdf"
        ]
    },
    [ToolId.MERGE_PDFS]: {
        icon: <span className="material-symbols-rounded">library_add</span>,
        name: t("home.merge.title", "Merge"),
        component: null,
        view: "merge",
        description: t("home.merge.desc", "Merge multiple PDFs into a single document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1
    },
    [ToolId.MULTI_TOOL]: {
        icon: <span className="material-symbols-rounded">dashboard_customize</span>,
        name: t("home.multiTool.title", "Multi-Tool"),
        component: null,
        view: "pageEditor",
        description: t("home.multiTool.desc", "Use multiple tools on a single PDF document"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1
    },
    [ToolId.OCR]: {
        icon: <span className="material-symbols-rounded">quick_reference_all</span>,
        name: t("home.ocr.title", "OCR"),
        component: OCRPanel,
        view: "convert",
        description: t("home.ocr.desc", "Extract text from scanned PDFs using Optical Character Recognition"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL,
        maxFiles: -1
    },
    [ToolId.REDACT]: {
        icon: <span className="material-symbols-rounded">visibility_off</span>,
        name: t("home.redact.title", "Redact"),
        component: null,
        view: "redact",
        description: t("home.redact.desc", "Permanently remove sensitive information from PDF documents"),
        categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
        subcategoryId: SubcategoryId.GENERAL
    },
  };

  if (showPlaceholderTools) {
    return allTools;
  } else {
    const filteredTools = (Object.keys(allTools) as ToolId[])
      .filter(key => allTools[key].component !== null || allTools[key].link)
      .reduce((obj, key) => {
        obj[key] = allTools[key];
        return obj;
      }, {} as ToolRegistry);
    return filteredTools;
  }
}
