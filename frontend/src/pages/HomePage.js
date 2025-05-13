import React, { useState } from "react";
import ConstructionIcon from '@mui/icons-material/Construction';
import AddToPhotosIcon from '@mui/icons-material/AddToPhotos';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import CropIcon from '@mui/icons-material/Crop';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import TableChartIcon from '@mui/icons-material/TableChart';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import EditNoteIcon from '@mui/icons-material/EditNote';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import VerifiedIcon from '@mui/icons-material/Verified';
import RemoveModeratorIcon from '@mui/icons-material/RemoveModerator';
import SanitizerIcon from '@mui/icons-material/Sanitizer';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DrawIcon from '@mui/icons-material/Draw';
import ApprovalIcon from '@mui/icons-material/Approval';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CollectionsIcon from '@mui/icons-material/Collections';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import ScannerIcon from '@mui/icons-material/Scanner';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import CompareIcon from '@mui/icons-material/Compare';
import InfoIcon from '@mui/icons-material/Info';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import InvertColorsIcon from '@mui/icons-material/InvertColors';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PaletteIcon from '@mui/icons-material/Palette';
import ZoomInMapIcon from '@mui/icons-material/ZoomInMap';
import BuildIcon from '@mui/icons-material/Build';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import JavascriptIcon from '@mui/icons-material/Javascript';
import SegmentIcon from '@mui/icons-material/Segment';
import LayersIcon from '@mui/icons-material/Layers';
import GridOnIcon from '@mui/icons-material/GridOn';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import Icon from '@mui/material/Icon';

import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress-pdf";

const toolRegistry = {
  "split-pdf": { icon: <PictureAsPdfIcon />, name: "Split PDF", component: SplitPdfPanel },
  "compress-pdf": { icon: <ZoomInMapIcon />, name: "Compress PDF", component: CompressPdfPanel }
};

const tools = Object.entries(toolRegistry).map(([id, { icon, name }]) => ({ id, icon, name }));

// Example tool panels
function ToolPanel({ selectedTool }) {
  if (!selectedTool) {
    return (
      <div className="p-2 border rounded bg-white shadow-sm">
        <p className="text-sm">Select a tool to begin interacting with the PDF.</p>
      </div>
    );
  }
  return (
    <div className="p-2 border rounded bg-white shadow-sm">
      <h3 className="font-semibold text-sm mb-2">{selectedTool.name}</h3>
      <p className="text-xs text-gray-600">This is the panel for {selectedTool.name}.</p>
    </div>
  );
}

export default function HomePage() {
const tools = [
  { id: "multi-tool", icon: <ConstructionIcon />, name: "Multi-Tool" },
  { id: "merge-pdfs", icon: <AddToPhotosIcon />, name: "Merge PDFs" },
  { id: "split-pdf", icon: <ContentCutIcon />, name: "Split PDF" },
  { id: "rotate-pdf", icon: <RotateRightIcon />, name: "Rotate Pages" },
  { id: "crop", icon: <CropIcon />, name: "Crop PDF" },
  { id: "pdf-organizer", icon: <FormatListBulletedIcon />, name: "PDF Organizer" },
  { id: "remove-pages", icon: <DeleteIcon />, name: "Remove Pages" },
  { id: "multi-page-layout", icon: <DashboardIcon />, name: "Page Layout" },
  { id: "scale-pages", icon: <FullscreenIcon />, name: "Scale Pages" },
  { id: "extract-page", icon: <FileUploadIcon />, name: "Extract Page" },
  { id: "pdf-to-single-page", icon: <LooksOneIcon />, name: "PDF to Single Page" },
  { id: "img-to-pdf", icon: <PictureAsPdfIcon />, name: "Image to PDF" },
  { id: "file-to-pdf", icon: <InsertDriveFileIcon />, name: "File to PDF" },
  { id: "url-to-pdf", icon: <LinkIcon />, name: "URL to PDF" },
  { id: "html-to-pdf", icon: <CodeIcon />, name: "HTML to PDF" },
  { id: "markdown-to-pdf", icon: <IntegrationInstructionsIcon />, name: "Markdown to PDF" },
  { id: "pdf-to-img", icon: <CollectionsIcon />, name: "PDF to Image" },
  { id: "pdf-to-pdfa", icon: <PictureAsPdfIcon />, name: "PDF to PDF/A" },
  { id: "pdf-to-word", icon: <InsertDriveFileIcon />, name: "PDF to Word" },
  { id: "pdf-to-presentation", icon: <DashboardIcon />, name: "PDF to Presentation" },
  { id: "pdf-to-text", icon: <AssignmentIcon />, name: "PDF to Text" },
  { id: "pdf-to-html", icon: <CodeIcon />, name: "PDF to HTML" },
  { id: "pdf-to-xml", icon: <CodeIcon />, name: "PDF to XML" },
  { id: "pdf-to-csv", icon: <TableChartIcon />, name: "PDF to CSV" },
  { id: "pdf-to-markdown", icon: <IntegrationInstructionsIcon />, name: "PDF to Markdown" },
  { id: "add-password", icon: <LockIcon />, name: "Add Password" },
  { id: "remove-password", icon: <LockOpenIcon />, name: "Remove Password" },
  { id: "change-permissions", icon: <LockIcon />, name: "Change Permissions" },
  { id: "sign", icon: <EditNoteIcon />, name: "Sign PDF" },
  { id: "cert-sign", icon: <WorkspacePremiumIcon />, name: "Certify Signature" },
  { id: "validate-signature", icon: <VerifiedIcon />, name: "Validate Signature" },
  { id: "remove-cert-sign", icon: <RemoveModeratorIcon />, name: "Remove Cert Signature" },
  { id: "sanitize-pdf", icon: <SanitizerIcon />, name: "Sanitize PDF" },
  { id: "auto-redact", icon: <VisibilityOffIcon />, name: "Auto Redact" },
  { id: "redact", icon: <DrawIcon />, name: "Manual Redact" },
  { id: "stamp", icon: <ApprovalIcon />, name: "Add Stamp" },
  { id: "add-watermark", icon: <WaterDropIcon />, name: "Add Watermark" },
  { id: "view-pdf", icon: <MenuBookIcon />, name: "View PDF" },
  { id: "add-page-numbers", icon: <LooksOneIcon />, name: "Add Page Numbers" },
  { id: "add-image", icon: <AddPhotoAlternateIcon />, name: "Add Image" },
  { id: "change-metadata", icon: <AssignmentIcon />, name: "Change Metadata" },
  { id: "ocr-pdf", icon: <LayersIcon />, name: "OCR PDF" },
  { id: "extract-images", icon: <CollectionsIcon />, name: "Extract Images" },
  { id: "flatten", icon: <LayersClearIcon />, name: "Flatten PDF" },
  { id: "remove-blanks", icon: <ScannerIcon />, name: "Remove Blank Pages" },
  { id: "remove-annotations", icon: <NoteAltIcon />, name: "Remove Annotations" },
  { id: "compare", icon: <CompareIcon />, name: "Compare PDFs" },
  { id: "get-info-on-pdf", icon: <InfoIcon />, name: "PDF Info" },
  { id: "remove-image-pdf", icon: <HighlightOffIcon />, name: "Remove Images from PDF" },
  { id: "replace-and-invert-color-pdf", icon: <InvertColorsIcon />, name: "Invert Colors" },
  { id: "unlock-pdf-forms", icon: <LayersIcon />, name: "Unlock PDF Forms" },
  { id: "pipeline", icon: <AccountTreeIcon />, name: "Pipeline" },
  { id: "adjust-contrast", icon: <PaletteIcon />, name: "Adjust Contrast" },
  { id: "compress-pdf", icon: <ZoomInMapIcon />, name: "Compress PDF" },
  { id: "extract-image-scans", icon: <ScannerIcon />, name: "Extract Image Scans" },
  { id: "repair", icon: <BuildIcon />, name: "Repair PDF" },
  { id: "auto-rename", icon: <DriveFileRenameOutlineIcon />, name: "Auto Rename" },
  { id: "show-javascript", icon: <JavascriptIcon />, name: "Show JavaScript" },
  { id: "overlay-pdf", icon: <LayersIcon />, name: "Overlay PDF" },

];

const [selectedTool, setSelectedTool] = useState(null);
const [search, setSearch] = useState("");
const [pdfFile, setPdfFile] = useState(null);
const SelectedComponent = selectedTool ? toolRegistry[selectedTool.id]?.component : null;
const [downloadUrl, setDownloadUrl] = useState(null);

const filteredTools = tools.filter(tool =>
  tool.name.toLowerCase().includes(search.toLowerCase())
);

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file && file.type === "application/pdf") {
    const fileUrl = URL.createObjectURL(file);
    setPdfFile({ file, url: fileUrl });
  }
}

return (    <div className="flex h-screen overflow-hidden">
  {/* Left Sidebar */}
  <div className="w-64 bg-gray-100 p-4 flex flex-col space-y-2 overflow-y-auto border-r">
    <input
      type="text"
      placeholder="Search tools..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="mb-3 px-2 py-1 border rounded text-sm"
    />
    {filteredTools.map(tool => (
      <button
        key={tool.id}
        title={tool.name}
        onClick={() => setSelectedTool(tool)}
        className="flex items-center space-x-3 p-2 hover:bg-gray-200 rounded text-left"
      >
        <div className="text-xl leading-none flex items-center justify-center h-6 w-6">
          {tool.icon}
        </div>
        <span className="text-sm font-medium">{tool.name}</span>
      </button>
    ))}
  </div>

{/* Central PDF Viewer Area */}
<div className="flex-1 bg-white flex items-center justify-center overflow-hidden">
  <div className="w-full h-full max-w-5xl max-h-[95vh] border rounded shadow-md bg-gray-50 flex items-center justify-center">
    {!pdfFile ? (
      <label className="cursor-pointer text-blue-600 underline">
        Click to upload a PDF
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
      </label>
    ) : (
      <iframe
        src={pdfFile.url}
        title="PDF Viewer"
        className="w-full h-full border-none"
      />
    )}
  </div>
</div>

  {/* Right Sidebar: Tool Interactions */}
  <div className="w-72 bg-gray-50 p-4 border-l overflow-y-auto">
    <h2 className="text-lg font-semibold mb-4">Tool Panel</h2>
    <div className="space-y-3">
      {SelectedComponent ? (
        <SelectedComponent file={pdfFile} downloadUrl setDownloadUrl />
      ) : selectedTool ? (
        <div className="p-2 border rounded bg-white shadow-sm">
          <h3 className="font-semibold text-sm mb-2">{selectedTool.name}</h3>
          <p className="text-xs text-gray-600">This is the panel for {selectedTool.name}.</p>
        </div>
      ) : (
        <div className="p-2 border rounded bg-white shadow-sm">
          <p className="text-sm">Select a tool to begin interacting with the PDF.</p>
        </div>
      )}
    </div>
  </div>
</div>
);
}
