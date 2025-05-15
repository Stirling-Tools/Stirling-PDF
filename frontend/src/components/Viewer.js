import React from "react";

export default function Viewer({ pdfFile, setPdfFile }) {
  return pdfFile ? (
    <iframe
      src={pdfFile.url}
      title="PDF Viewer"
      className="w-full h-full border-none"
    />
  ) : (
    <label className="cursor-pointer text-blue-600 underline">
      Click to upload a PDF
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file && file.type === "application/pdf") {
            const fileUrl = URL.createObjectURL(file);
            setPdfFile({ file, url: fileUrl });
          }
        }}
        className="hidden"
      />
    </label>
  );
}
