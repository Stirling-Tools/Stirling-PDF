import React, { useState } from "react";
import axios from "axios";
import DownloadIcon from '@mui/icons-material/Download';

export default function SplitPdfPanel({ file, downloadUrl, setDownloadUrl }) {
  const [mode, setMode] = useState("byPages");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus("Please upload a PDF first.");
      return;
    }

    const formData = new FormData();
    formData.append("fileInput", file.file);

    let endpoint = "";
    if (mode === "byPages") {
      const pageNumbers = document.getElementById("pagesInput").value;
      formData.append("pageNumbers", pageNumbers);
      endpoint = "/api/v1/general/split-pages";
    } else if (mode === "bySections") {
      const horizontal = document.getElementById("horizontalDivisions").value;
      const vertical = document.getElementById("verticalDivisions").value;
      const merge = document.getElementById("merge").checked;
      formData.append("horizontalDivisions", horizontal);
      formData.append("verticalDivisions", vertical);
      formData.append("merge", merge);
      endpoint = "/api/v1/general/split-pdf-by-sections";
    } else if (mode === "bySizeOrCount") {
      const splitType = document.getElementById("splitType").value;
      const splitValue = document.getElementById("splitValue").value;
      formData.append("splitType", splitType === "size" ? 0 : splitType === "pages" ? 1 : 2);
      formData.append("splitValue", splitValue);
      endpoint = "/api/v1/general/split-by-size-or-count";
    } else if (mode === "byChapters") {
      const bookmarkLevel = document.getElementById("bookmarkLevel").value;
      const includeMetadata = document.getElementById("includeMetadata").checked;
      const allowDuplicates = document.getElementById("allowDuplicates").checked;
      formData.append("bookmarkLevel", bookmarkLevel);
      formData.append("includeMetadata", includeMetadata);
      formData.append("allowDuplicates", allowDuplicates);
      endpoint = "/api/v1/general/split-pdf-by-chapters";
    }

    setStatus("Processing split...");

    try {
      const response = await axios.post(endpoint, formData, { responseType: "blob" });
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "split_output.zip");
      document.body.appendChild(link);
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus("Download ready.");
        } catch (error) {
      console.error(error);
      setStatus("Split failed.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-2 border rounded bg-white shadow-sm space-y-4 text-sm">
      <h3 className="font-semibold">Split PDF</h3>

      <div>
        <label className="block mb-1 font-medium">Split Mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full border px-2 py-1 rounded"
        >
          <option value="byPages">Split by Pages (e.g. 1,3,5-10)</option>
          <option value="bySections">Split by Grid Sections</option>
          <option value="bySizeOrCount">Split by Size or Count</option>
          <option value="byChapters">Split by Chapters</option>
        </select>
      </div>

      {mode === "byPages" && (
        <div>
          <label className="block font-medium mb-1">Pages</label>
          <input
            type="text"
            id="pagesInput"
            className="w-full border px-2 py-1 rounded"
            placeholder="e.g. 1,3,5-10"
          />
        </div>
      )}

      {mode === "bySections" && (
        <div className="space-y-2">
          <div>
            <label className="block font-medium mb-1">Horizontal Divisions</label>
            <input
              type="number"
              id="horizontalDivisions"
              className="w-full border px-2 py-1 rounded"
              min="0"
              max="300"
              defaultValue="0"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Vertical Divisions</label>
            <input
              type="number"
              id="verticalDivisions"
              className="w-full border px-2 py-1 rounded"
              min="0"
              max="300"
              defaultValue="1"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="merge" />
            <label htmlFor="merge">Merge sections into one PDF</label>
          </div>
        </div>
      )}

      {mode === "bySizeOrCount" && (
        <div className="space-y-2">
          <div>
            <label className="block font-medium mb-1">Split Type</label>
            <select id="splitType" className="w-full border px-2 py-1 rounded">
              <option value="size">By Size</option>
              <option value="pages">By Page Count</option>
              <option value="docs">By Document Count</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Split Value</label>
            <input
              type="text"
              id="splitValue"
              className="w-full border px-2 py-1 rounded"
              placeholder="e.g. 10MB or 5 pages"
            />
          </div>
        </div>
      )}

      {mode === "byChapters" && (
        <div className="space-y-2">
          <div>
            <label className="block font-medium mb-1">Bookmark Level</label>
            <input
              type="number"
              id="bookmarkLevel"
              className="w-full border px-2 py-1 rounded"
              defaultValue="0"
              min="0"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="includeMetadata" />
            <label htmlFor="includeMetadata">Include Metadata</label>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="allowDuplicates" />
            <label htmlFor="allowDuplicates">Allow Duplicate Bookmarks</label>
          </div>
        </div>
      )}

      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded mt-2">
        Split PDF
      </button>

      {status && <p className="text-xs text-gray-600">{status}</p>}

{status === "Download ready." && downloadUrl && (
  <a
    href={downloadUrl}
    download="split_output.zip"
    className="inline-flex items-center bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition mt-2"
  >
    <DownloadIcon className="mr-2" />
    Download Split PDF
  </a>
)}

    </form>
  );
}
