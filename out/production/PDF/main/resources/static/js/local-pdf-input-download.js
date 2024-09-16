async function downloadFilesWithCallback(processFileCallback) {
  const fileInput = document.querySelector('input[type="file"]');
  const files = fileInput.files;

  const zipThreshold = 4;
  const zipFiles = files.length > zipThreshold;

  let jszip = null;
  if (zipFiles) {
    jszip = new JSZip();
  }

  const promises = Array.from(files).map(async (file) => {
    const { processedData, fileName } = await processFileCallback(file);

    if (zipFiles) {
      jszip.file(fileName, processedData);
    } else {
      const url = URL.createObjectURL(processedData);
      const downloadOption = localStorage.getItem("downloadOption");

      if (downloadOption === "sameWindow") {
        window.location.href = url;
      } else if (downloadOption === "newWindow") {
        window.open(url, "_blank");
      } else {
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = fileName;
        downloadLink.click();
      }
    }
  });

  await Promise.all(promises);

  if (zipFiles) {
    const content = await jszip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "files.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
