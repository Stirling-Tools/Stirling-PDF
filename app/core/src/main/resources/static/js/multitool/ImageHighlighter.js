class ImageHighlighter {
  imageHighlighter;
  constructor(id) {
    this.imageHighlighter = document.getElementById(id);
    this.imageHighlightCallback = this.imageHighlightCallback.bind(this);

    var styleElement = document.createElement("link");
    styleElement.rel = "stylesheet";
    styleElement.href = "css/imageHighlighter.css";

    document.head.appendChild(styleElement);

    this.imageHighlighter.onclick = () => {
      this.imageHighlighter.childNodes.forEach((child) => {
        child.classList.add("remove");
        setTimeout(() => {
          this.imageHighlighter.removeChild(child);
        }, 100);
      });
    };
  }

  imageHighlightCallback(highlightEvent) {
    var bigImg = document.createElement("img");
    bigImg.onclick = (imageClickEvent) => {
      // This prevents the highlighter's onClick from closing the image when clicking
      // on the image instead of next to it.
      imageClickEvent.preventDefault();
      imageClickEvent.stopPropagation();
    };
    bigImg.src = highlightEvent.target.src;
    bigImg.style.rotate = highlightEvent.target.style.rotate;
    this.imageHighlighter.appendChild(bigImg);
  }

  setActions() {
    // not needed in this case
  }

  adapt(div) {
    const img = div.querySelector(".page-image");
    img.addEventListener("click", this.imageHighlightCallback);
    return div;
  }

  async addImageFile(file, nextSiblingElement) {
    const div = document.createElement("div");
    div.classList.add("page-container");

    var img = document.createElement("img");
    img.classList.add("page-image");
    img.src = URL.createObjectURL(file);
    div.appendChild(img);

    this.pdfAdapters.forEach((adapter) => {
      adapter.adapt?.(div);
    });
    if (nextSiblingElement) {
      this.pagesContainer.insertBefore(div, nextSiblingElement);
    } else {
      this.pagesContainer.appendChild(div);
    }
  }
}

export default ImageHighlighter;
