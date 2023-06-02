function showErrorBanner(message, stackTrace) {
	const errorContainer = document.getElementById("errorContainer");
	errorContainer.style.display = "block"; // Display the banner
	document.querySelector("#errorContainer .alert-heading").textContent = "Error";
	document.querySelector("#errorContainer p").textContent = message;
	document.querySelector("#traceContent").textContent = stackTrace;
}

$(document).ready(function() {
	$('form').submit(async function(event) {
		event.preventDefault();

		const url = this.action;
		const files = $('#fileInput-input')[0].files;
		const formData = new FormData(this);
		const override = $('#override').val() || '';

		$('#submitBtn').text('Processing...');

		try {
			if (override === 'multi' || files.length > 1 && override !== 'single') {
				// Show the progress bar
				$('#progressBarContainer').show();
				// Initialize the progress bar
				//let progressBar = $('#progressBar');
				//progressBar.css('width', '0%');
				//progressBar.attr('aria-valuenow', 0);
				//progressBar.attr('aria-valuemax', files.length);

				await submitMultiPdfForm(url, files);
			} else {
				const downloadDetails = await handleSingleDownload(url, formData);
				const downloadOption = localStorage.getItem('downloadOption');

				// Handle the download action according to the selected option
				//handleDownloadAction(downloadOption, downloadDetails.blob, downloadDetails.filename);

				// Update the progress bar
				//updateProgressBar(progressBar, 1);

			}

			$('#submitBtn').text('Submit');
		} catch (error) {
			handleDownloadError(error);
			$('#submitBtn').text('Submit');
			console.error(error);
		}
	});
});

function handleDownloadAction(downloadOption, blob, filename) {
	const url = URL.createObjectURL(blob);

	switch (downloadOption) {
		case 'sameWindow':
			// Open the file in the same window
			window.location.href = url;
			break;
		case 'newWindow':
			// Open the file in a new window
			window.open(url, '_blank');
			break;
		default:
			// Download the file
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.click();
			break;
	}
}

async function handleSingleDownload(url, formData) {
	try {
		const response = await fetch(url, { method: 'POST', body: formData });
		const contentType = response.headers.get('content-type');

		if (!response.ok) {
			if (contentType && contentType.includes('application/json')) {
				return handleJsonResponse(response);
				console.error('Throwing error banner, response was not okay');
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const contentDisposition = response.headers.get('Content-Disposition');
		let filename = getFilenameFromContentDisposition(contentDisposition);

		const blob = await response.blob();

		if (contentType.includes('application/pdf') || contentType.includes('image/')) {
			return handleResponse(blob, filename, true);
		} else {
			return handleResponse(blob, filename);
		}
	} catch (error) {
		console.error('Error in handleSingleDownload:', error);
		throw error;  // Re-throw the error if you want it to be handled higher up.
	}
}

function getFilenameFromContentDisposition(contentDisposition) {
	let filename;

	if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
		filename = decodeURIComponent(contentDisposition.split('filename=')[1].replace(/"/g, '')).trim();
	} else {
		// If the Content-Disposition header is not present or does not contain the filename, use a default filename
		filename = 'download';
	}

	return filename;
}



async function handleJsonResponse(response) {
	const json = await response.json();
	const errorMessage = JSON.stringify(json, null, 2);
	if (errorMessage.toLowerCase().includes('the password is incorrect') || errorMessage.toLowerCase().includes('Password is not provided')) {
		alert('[[#{error.pdfPassword}]]');
	} else {
		showErrorBanner(json.error + ':' + json.message, json.trace);
	}
}


async function handleResponse(blob, filename, considerViewOptions = false) {
	if (!blob) return;
	const downloadOption = localStorage.getItem('downloadOption');
	if (considerViewOptions) {
		if (downloadOption === 'sameWindow') {
			const url = URL.createObjectURL(blob);
			window.location.href = url;
			return;
		} else if (downloadOption === 'newWindow') {
			const url = URL.createObjectURL(blob);
			window.open(url, '_blank');
			return;
		}
	}
	downloadFile(blob, filename);
	return { filename, blob };
}

function handleDownloadError(error) {
	const errorMessage = error.message;
	showErrorBanner(errorMessage);
}

let urls = []; // An array to hold all the URLs

function downloadFile(blob, filename) {
	if (!(blob instanceof Blob)) {
		console.error('Invalid blob passed to downloadFile function');
		return;
	}

	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	urls.push(url); // Store the URL so it doesn't get garbage collected too soon

	return { filename, blob };
}



async function submitMultiPdfForm(url, files) {
	const zipThreshold = parseInt(localStorage.getItem('zipThreshold'), 10) || 4;
	const zipFiles = files.length > zipThreshold;
	let jszip = null;
	//let progressBar = $('#progressBar');
	//progressBar.css('width', '0%');
	//progressBar.attr('aria-valuenow', 0);
	//progressBar.attr('aria-valuemax', Array.from(files).length);
	if (zipFiles) {
		jszip = new JSZip();
	}

	// Get existing form data
	let formData = new FormData($('form')[0]);
	formData.delete('fileInput');

	const CONCURRENCY_LIMIT = 8;
	const chunks = [];
	for (let i = 0; i < Array.from(files).length; i += CONCURRENCY_LIMIT) {
		chunks.push(Array.from(files).slice(i, i + CONCURRENCY_LIMIT));
	}

	for (const chunk of chunks) {
		const promises = chunk.map(async file => {
			let fileFormData = new FormData();
			fileFormData.append('fileInput', file);

			// Add other form data
			for (let pair of formData.entries()) {
				fileFormData.append(pair[0], pair[1]);
			}

			try {
				const downloadDetails = await handleSingleDownload(url, fileFormData);
				console.log(downloadDetails);
				if (zipFiles) {
					jszip.file(downloadDetails.filename, downloadDetails.blob);
				} else {
					downloadFile(downloadDetails.blob, downloadDetails.filename);
				}
				//updateProgressBar(progressBar, Array.from(files).length);
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
			console.error('Error generating ZIP file: ' + error);
		}
	}
}



function updateProgressBar(progressBar, files) {
	let progress = ((progressBar.attr('aria-valuenow') / files.length) * 100) + (100 / files.length);
	progressBar.css('width', progress + '%');
	progressBar.attr('aria-valuenow', parseInt(progressBar.attr('aria-valuenow')) + 1);
}
window.addEventListener('unload', () => {
	for (const url of urls) {
		URL.revokeObjectURL(url);
	}
});
