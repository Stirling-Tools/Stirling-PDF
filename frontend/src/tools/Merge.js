import React, { useState, useEffect } from "react";

export default function MergePdfPanel({ files, setDownloadUrl }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [downloadUrl, setLocalDownloadUrl] = useState(null); // Local state for download URL
  const [isLoading, setIsLoading] = useState(false); // Loading state
  const [errorMessage, setErrorMessage] = useState(null); // Error message state

  // Sync selectedFiles with files whenever files change
  useEffect(() => {
    setSelectedFiles(files.map(() => true)); // Select all files by default
  }, [files]);

  const handleMerge = async () => {
    const filesToMerge = files.filter((_, index) => selectedFiles[index]);

    if (filesToMerge.length < 2) {
      alert("Please select at least two PDFs to merge.");
      return;
    }

    const formData = new FormData();
    filesToMerge.forEach((file) => formData.append("fileInput", file)); // Use "fileInput" as the key

    setIsLoading(true); // Start loading
    setErrorMessage(null); // Clear previous errors

    try {
      const response = await fetch("/api/v1/general/merge-pdfs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to merge PDFs: ${errorText}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      setDownloadUrl(downloadUrl); // Pass to parent component
      setLocalDownloadUrl(downloadUrl); // Store locally for download button
    } catch (error) {
      console.error("Error merging PDFs:", error);
      setErrorMessage(error.message); // Set error message
    } finally {
      setIsLoading(false); // Stop loading
    }
  };

  const handleCheckboxChange = (index) => {
    setSelectedFiles((prevSelectedFiles) =>
      prevSelectedFiles.map((selected, i) => (i === index ? !selected : selected))
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Merge PDFs</h3>
      <ul className="list-disc pl-5 text-sm">
        {files.map((file, index) => (
          <li key={index} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedFiles[index]}
              onChange={() => handleCheckboxChange(index)}
              className="form-checkbox"
            />
            <span>{file.name}</span>
          </li>
        ))}
      </ul>
      {files.filter((_, index) => selectedFiles[index]).length < 2 && (
        <p className="text-sm text-red-500">
          Please select at least two PDFs to merge.
        </p>
      )}
      <button
        onClick={handleMerge}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        disabled={files.filter((_, index) => selectedFiles[index]).length < 2 || isLoading}
      >
        {isLoading ? "Merging..." : "Merge PDFs"}
      </button>
      {errorMessage && (
        <p className="text-sm text-red-500 mt-2">
          {errorMessage}
        </p>
      )}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download="merged.pdf"
          className="block mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-center"
        >
          Download Merged PDF
        </a>
      )}
    </div>
  );
}
