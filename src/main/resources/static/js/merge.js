document.getElementById("fileInput-input").addEventListener("change", function() {
	var files = this.files;
	var list = document.getElementById("selectedFiles");
	list.innerHTML = "";
	for (var i = 0; i < files.length; i++) {
		var item = document.createElement("li");
		item.className = "list-group-item";
		item.innerHTML = `
                        	      <div class="d-flex justify-content-between align-items-center w-100">
                        	        <div class="filename">${files[i].name}</div>
                        	        <div class="arrows d-flex">
                        	          <button class="btn btn-secondary move-up"><span>&uarr;</span></button>
                        	          <button class="btn btn-secondary move-down"><span>&darr;</span></button>
                        	        </div>
                        	      </div>
                        	    `;
		list.appendChild(item);
	}

	var moveUpButtons = document.querySelectorAll(".move-up");
	for (var i = 0; i < moveUpButtons.length; i++) {
		moveUpButtons[i].addEventListener("click", function(event) {
			event.preventDefault();
			var parent = this.closest(".list-group-item");
			var grandParent = parent.parentNode;
			if (parent.previousElementSibling) {
				grandParent.insertBefore(parent, parent.previousElementSibling);
				updateFiles();
			}
		});
	}

	var moveDownButtons = document.querySelectorAll(".move-down");
	for (var i = 0; i < moveDownButtons.length; i++) {
		moveDownButtons[i].addEventListener("click", function(event) {
			event.preventDefault();
			var parent = this.closest(".list-group-item");
			var grandParent = parent.parentNode;
			if (parent.nextElementSibling) {
				grandParent.insertBefore(parent.nextElementSibling, parent);
				updateFiles();
			}
		});
	}

	function updateFiles() {
		var dataTransfer = new DataTransfer();
		var liElements = document.querySelectorAll("#selectedFiles li");

		for (var i = 0; i < liElements.length; i++) {
			var fileNameFromList = liElements[i].querySelector(".filename").innerText;
			var fileFromFiles;
			for (var j = 0; j < files.length; j++) {
				var file = files[j];
				if (file.name === fileNameFromList) {
					dataTransfer.items.add(file);
					break;
				}
			}
		}
		document.getElementById("fileInput-input").files = dataTransfer.files;
	}
});