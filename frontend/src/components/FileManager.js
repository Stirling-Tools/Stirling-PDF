import React from "react";

export default function FileManager({ files, setFiles, allowMultiple = true }) {
  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    setFiles((prevFiles) => (allowMultiple ? [...prevFiles, ...uploadedFiles] : uploadedFiles));
  };

  const handleRemoveFile = (index) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4 w-full max-w-3xl">
      <input
        type="file"
        accept="application/pdf"
        multiple={allowMultiple}
        onChange={handleFileUpload}
        className="block"
      />
      <ul className="list-disc pl-5 text-sm">
        {files.map((file, index) => (
          <li key={index} className="flex justify-between items-center">
            {file.name}
            <button
              onClick={() => handleRemoveFile(index)}
              className="text-red-600 hover:underline text-xs"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
