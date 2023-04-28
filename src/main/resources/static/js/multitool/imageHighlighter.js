const getImageHighlighterCallback = (id) => {
    const imageHighlighter = document.getElementById(id);
    imageHighlighter.onclick = () => {
        imageHighlighter.childNodes.forEach((child) => {
            child.classList.add('remove');
            setTimeout(() => {
                imageHighlighter.removeChild(child);
            }, 100)
        })
    }

    const imageHighlightCallback = (highlightEvent) => {
        var bigImg = document.createElement('img');
        bigImg.onclick = (imageClickEvent) => {
            // This prevents the highlighter's onClick from closing the image when clicking on the image
            // instead of next to it.
            imageClickEvent.preventDefault();
            imageClickEvent.stopPropagation();
        };
        bigImg.src = highlightEvent.target.src;
        imageHighlighter.appendChild(bigImg);
    };

    return imageHighlightCallback
}

export default getImageHighlighterCallback;