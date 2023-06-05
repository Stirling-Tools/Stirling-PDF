document.addEventListener('DOMContentLoaded', function() {
	const fileInput = document.getElementById(elementID);
	// Prevent default behavior for drag events
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		fileInput.addEventListener(eventName, preventDefaults, false);
	});

	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	// Add drop event listener
	fileInput.addEventListener('drop', handleDrop, false);

	function handleDrop(e) {
		const dt = e.dataTransfer;
		const files = dt.files;
		fileInput.files = files;
		handleFileInputChange(fileInput)
	}
});

$("#"+elementID).on("change", function() {
	handleFileInputChange(this);
});

function handleFileInputChange(inputElement) {
	const files = $(inputElement).get(0).files;
	const fileNames = Array.from(files).map(f => f.name);
	const selectedFilesContainer = $(inputElement).siblings(".selected-files");
	selectedFilesContainer.empty();
	fileNames.forEach(fileName => {
		selectedFilesContainer.append("<div>" + fileName + "</div>");
	});
	if (fileNames.length === 1) {
		$(inputElement).siblings(".custom-file-label").addClass("selected").html(fileNames[0]);
	} else if (fileNames.length > 1) {
		$(inputElement).siblings(".custom-file-label").addClass("selected").html(fileNames.length + " " + filesSelected);
	} else {
		$(inputElement).siblings(".custom-file-label").addClass("selected").html(pdfPrompt);
	}
}