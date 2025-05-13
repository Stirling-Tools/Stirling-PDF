import React, { useState } from "react";
import axios from "axios";

export default function CompressPdfPanel({file}) {
  const [optimizeLevel, setOptimizeLevel] = useState("5");
  const [grayscale, setGrayscale] = useState(false);
  const [expectedOutputSize, setExpectedOutputSize] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setStatus("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("fileInput", file.file);
    formData.append("optimizeLevel", optimizeLevel);
    formData.append("grayscale", grayscale);
    if (expectedOutputSize) {
      formData.append("expectedOutputSize", expectedOutputSize);
    }

    setStatus("Compressing...");

    try {
      const response = await axios.post("/api/v1/misc/compress-pdf", formData, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "compressed.pdf");
      document.body.appendChild(link);
      link.click();

      setStatus("Download ready!");
    } catch (error) {
      console.error(error);
      setStatus("Failed to compress PDF.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">

      <div>
        <label className="block font-medium">Compression Level (1-9)</label>
        <select
          value={optimizeLevel}
          onChange={(e) => setOptimizeLevel(e.target.value)}
          className="w-full border px-2 py-1 rounded"
        >
          {[...Array(9)].map((_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="grayscale"
          checked={grayscale}
          onChange={(e) => setGrayscale(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="grayscale">Convert images to grayscale</label>
      </div>

      <div>
        <label className="block font-medium">Expected Output Size (e.g. 2MB)</label>
        <input
          type="text"
          value={expectedOutputSize}
          onChange={(e) => setExpectedOutputSize(e.target.value)}
          className="w-full border px-2 py-1 rounded"
        />
      </div>

      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
        Compress PDF
      </button>

      {status && <p className="text-xs text-gray-600 mt-2">{status}</p>}
    </form>
  );
}
