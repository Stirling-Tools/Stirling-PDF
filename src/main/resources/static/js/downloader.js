function showErrorBanner(message, stackTrace) {
  const errorContainer = document.getElementById("errorContainer");
  errorContainer.style.display = "block"; // Display the banner
  document.querySelector("#errorContainer .alert-heading").textContent = "Error";
  document.querySelector("#errorContainer p").textContent = message;
  document.querySelector("#traceContent").textContent = stackTrace;
}
let firstErrorOccurred = false;

$(document).ready(function () {
  $("form").submit(async function (event) {
    event.preventDefault();
    firstErrorOccurred = false;
    const url = this.action;
    const files = $("#fileInput-input")[0].files;
    const formData = new FormData(this);

    // Remove empty file entries
    for (let [key, value] of formData.entries()) {
      if (value instanceof File && !value.name) {
        formData.delete(key);
      }
    }
    const override = $("#override").val() || "";
    const originalButtonText = $("#submitBtn").text();
    $("#submitBtn").text("Processing...");
    console.log(override);

    // Set a timeout to show the game button if operation takes more than 5 seconds
    const timeoutId = setTimeout(() => {
      var boredWaiting = localStorage.getItem("boredWaiting") || "disabled";
      const showGameBtn = document.getElementById("show-game-btn");
      if (boredWaiting === "enabled" && showGameBtn) {
        showGameBtn.style.display = "block";
      }
    }, 5000);

    try {
      if (remoteCall === true) {
        if (override === "multi" || (!multiple && files.length > 1 && override !== "single")) {
          await submitMultiPdfForm(url, files);
        } else {
          await handleSingleDownload(url, formData);
        }
      }
      clearTimeout(timeoutId);
      $("#submitBtn").text(originalButtonText);
      
      // After process finishes, check for boredWaiting and gameDialog open status
      const boredWaiting = localStorage.getItem("boredWaiting") || "disabled";
      const gameDialog = document.getElementById('game-container-wrapper');
      if (boredWaiting === "enabled" && gameDialog && gameDialog.open) {
        // Display a green banner at the bottom of the screen saying "Download complete"
        let downloadCompleteText = "Download Complete";
        if(window.downloadCompleteText){
          downloadCompleteText = window.downloadCompleteText;
        }
        $("body").append('<div id="download-complete-banner" style="position:fixed;bottom:0;left:0;width:100%;background-color:green;color:white;text-align:center;padding:10px;font-size:16px;z-index:1000;">'+ downloadCompleteText + '</div>');
        setTimeout(function() {
          $("#download-complete-banner").fadeOut("slow", function() {
            $(this).remove(); // Remove the banner after fading out
          });
        }, 5000); // Banner will fade out after 5 seconds
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      handleDownloadError(error);
      $("#submitBtn").text(originalButtonText);
      console.error(error);
    }
  });
});

async function handleSingleDownload(url, formData, isMulti = false, isZip = false) {
  try {
    const response = await fetch(url, { method: "POST", body: formData });
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        console.error("Throwing error banner, response was not okay");
        return handleJsonResponse(response);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = getFilenameFromContentDisposition(contentDisposition);

    const blob = await response.blob();
    if (contentType.includes("application/pdf") || contentType.includes("image/")) {
      return handleResponse(blob, filename, !isMulti, isZip);
    } else {
      return handleResponse(blob, filename, false, isZip);
    }
  } catch (error) {
    console.error("Error in handleSingleDownload:", error);
    throw error; // Re-throw the error if you want it to be handled higher up.
  }
}

function getFilenameFromContentDisposition(contentDisposition) {
  let filename;

  if (contentDisposition && contentDisposition.indexOf("attachment") !== -1) {
    filename = decodeURIComponent(contentDisposition.split("filename=")[1].replace(/"/g, "")).trim();
  } else {
    // If the Content-Disposition header is not present or does not contain the filename, use a default filename
    filename = "download";
  }

  return filename;
}

async function handleJsonResponse(response) {
  const json = await response.json();
  const errorMessage = JSON.stringify(json, null, 2);
  if (
    errorMessage.toLowerCase().includes("the password is incorrect") ||
    errorMessage.toLowerCase().includes("Password is not provided") ||
    errorMessage.toLowerCase().includes("PDF contains an encryption dictionary")
  ) {
    if (!firstErrorOccurred) {
      firstErrorOccurred = true;
      alert(pdfPasswordPrompt);
    }
  } else {
    showErrorBanner(json.error + ":" + json.message, json.trace);
  }
}

async function handleResponse(blob, filename, considerViewOptions = false, isZip = false) {
  if (!blob) return;
  const downloadOption = localStorage.getItem("downloadOption");
  if (considerViewOptions) {
    if (downloadOption === "sameWindow") {
      const url = URL.createObjectURL(blob);
      window.location.href = url;
      return;
    } else if (downloadOption === "newWindow") {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return;
    }
  }
  if (!isZip) {
    downloadFile(blob, filename);
  }
  return { filename, blob };
}

function handleDownloadError(error) {
  const errorMessage = error.message;
  showErrorBanner(errorMessage);
}

let urls = []; // An array to hold all the URLs

function downloadFile(blob, filename) {
  if (!(blob instanceof Blob)) {
    console.error("Invalid blob passed to downloadFile function");
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  urls.push(url); // Store the URL so it doesn't get garbage collected too soon

  return { filename, blob };
}

async function submitMultiPdfForm(url, files) {
  const zipThreshold = parseInt(localStorage.getItem("zipThreshold"), 10) || 4;
  const zipFiles = files.length > zipThreshold;
  let jszip = null;
  // Show the progress bar
  $(".progressBarContainer").show();
  // Initialize the progress bar

  let progressBar = $(".progressBar");
  progressBar.css("width", "0%");
  progressBar.attr("aria-valuenow", 0);
  progressBar.attr("aria-valuemax", files.length);

  if (zipFiles) {
    jszip = new JSZip();
  }

  // Get the form with the method attribute set to POST
  let postForm = document.querySelector('form[method="POST"]');

  // Get existing form data
  let formData;
  if (postForm) {
    formData = new FormData($(postForm)[0]); // Convert the form to a jQuery object and get the raw DOM element
  } else {
    console.log("No form with POST method found.");
  }
  //Remove file to reuse parameters for other runs
  formData.delete("fileInput");
  // Remove empty file entries
  for (let [key, value] of formData.entries()) {
    if (value instanceof File && !value.name) {
      formData.delete(key);
    }
  }
  const CONCURRENCY_LIMIT = 8;
  const chunks = [];
  for (let i = 0; i < Array.from(files).length; i += CONCURRENCY_LIMIT) {
    chunks.push(Array.from(files).slice(i, i + CONCURRENCY_LIMIT));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (file) => {
      let fileFormData = new FormData();
      fileFormData.append("fileInput", file);
      console.log(fileFormData);
      // Add other form data
      for (let pair of formData.entries()) {
        fileFormData.append(pair[0], pair[1]);
        console.log(pair[0] + ", " + pair[1]);
      }

      try {
        const downloadDetails = await handleSingleDownload(url, fileFormData, true, zipFiles);
        console.log(downloadDetails);
        if (zipFiles) {
          jszip.file(downloadDetails.filename, downloadDetails.blob);
        } else {
          //downloadFile(downloadDetails.blob, downloadDetails.filename);
        }
        updateProgressBar(progressBar, Array.from(files).length);
      } catch (error) {
        handleDownloadError(error);
        console.error(error);
      }
    });
    await Promise.all(promises);
  }

  if (zipFiles) {
    try {
      const content = await jszip.generateAsync({ type: "blob" });
      downloadFile(content, "files.zip");
    } catch (error) {
      console.error("Error generating ZIP file: " + error);
    }
  }
  progressBar.css("width", "100%");
  progressBar.attr("aria-valuenow", Array.from(files).length);
}

function updateProgressBar(progressBar, files) {
  let progress = (progressBar.attr("aria-valuenow") / files.length) * 100 + 100 / files.length;
  progressBar.css("width", progress + "%");
  progressBar.attr("aria-valuenow", parseInt(progressBar.attr("aria-valuenow")) + 1);
}
window.addEventListener("unload", () => {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
});
