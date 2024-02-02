class PdfActionsManager {
    pageDirection; 
    pagesContainer;

    constructor(id) {
        this.pagesContainer = document.getElementById(id);
        this.pageDirection = document.documentElement.getAttribute("lang-direction");

        var styleElement = document.createElement('link');
        styleElement.rel = 'stylesheet';
        styleElement.href = 'css/pdfActions.css'

        document.head.appendChild(styleElement);
    }

    getPageContainer(element) {
        var container = element
        while (!container.classList.contains('page-container')) {
            container = container.parentNode;
        }
        return container;
    }

    moveUpButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        
        const sibling = imgContainer.previousSibling;
        if (sibling) {
            this.movePageTo(imgContainer, sibling, true);
        }
    }

    moveDownButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        const sibling = imgContainer.nextSibling;
        if (sibling) {
            this.movePageTo(imgContainer, sibling.nextSibling, true);
        }
    };

    rotateCCWButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        const img = imgContainer.querySelector("img");
        
        this.rotateElement(img, -90)
    };

    rotateCWButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        const img = imgContainer.querySelector("img");
        
        this.rotateElement(img, 90)
    };

    deletePageButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        this.pagesContainer.removeChild(imgContainer);
        if (this.pagesContainer.childElementCount === 0) {
            const filenameInput = document.getElementById('filename-input');
            const filenameParagraph = document.getElementById('filename');
            const downloadBtn = document.getElementById('export-button');

            filenameInput.disabled = true;
            filenameInput.value = "";
            filenameParagraph.innerText = "";

            downloadBtn.disabled = true;
        }
    };

    insertFileButtonCallback(e) {
        var imgContainer = this.getPageContainer(e.target);
        this.addPdfs(imgContainer)
    };

    setActions({ movePageTo, addPdfs, rotateElement }) {
        this.movePageTo = movePageTo;
        this.addPdfs = addPdfs;
        this.rotateElement = rotateElement;

        this.moveUpButtonCallback = this.moveUpButtonCallback.bind(this);
        this.moveDownButtonCallback = this.moveDownButtonCallback.bind(this);
        this.rotateCCWButtonCallback = this.rotateCCWButtonCallback.bind(this);
        this.rotateCWButtonCallback = this.rotateCWButtonCallback.bind(this);
        this.deletePageButtonCallback = this.deletePageButtonCallback.bind(this);
        this.insertFileButtonCallback = this.insertFileButtonCallback.bind(this);
    }

    adapt(div) {
        div.classList.add('pdf-actions_container');
        const leftDirection = this.pageDirection === 'rtl' ? 'right' : 'left'
        const rightDirection = this.pageDirection === 'rtl' ? 'left' : 'right'
        const buttonContainer = document.createElement('div');

        buttonContainer.classList.add("pdf-actions_button-container", "hide-on-drag");
                    
        const moveUp = document.createElement('button');
        moveUp.classList.add("pdf-actions_move-left-button","btn", "btn-secondary");
        moveUp.innerHTML = `<i class="bi bi-arrow-${leftDirection}-short"></i>`;
        moveUp.onclick = this.moveUpButtonCallback;
        buttonContainer.appendChild(moveUp);

        const moveDown = document.createElement('button');
        moveDown.classList.add("pdf-actions_move-right-button","btn", "btn-secondary");
        moveDown.innerHTML = `<i class="bi bi-arrow-${rightDirection}-short"></i>`;
        moveDown.onclick = this.moveDownButtonCallback;
        buttonContainer.appendChild(moveDown);
        
        const rotateCCW = document.createElement('button');
        rotateCCW.classList.add("btn", "btn-secondary");
        rotateCCW.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-counterclockwise" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z" />
                            <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z" />
                        </svg>`;
        rotateCCW.onclick = this.rotateCCWButtonCallback;
        buttonContainer.appendChild(rotateCCW);

        const rotateCW = document.createElement('button');
        rotateCW.classList.add("btn", "btn-secondary");
        rotateCW.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-clockwise" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                        </svg>`;
        rotateCW.onclick = this.rotateCWButtonCallback;
        buttonContainer.appendChild(rotateCW);

        const deletePage = document.createElement('button');
        deletePage.classList.add("btn", "btn-danger");
        deletePage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                        </svg>`;
        deletePage.onclick = this.deletePageButtonCallback;
        buttonContainer.appendChild(deletePage);

        div.appendChild(buttonContainer);

        const insertFileButtonContainer = document.createElement('div');
                
        insertFileButtonContainer.classList.add(
            "pdf-actions_insert-file-button-container",
            leftDirection,
            `align-center-${leftDirection}`);
        
        const insertFileButton = document.createElement('button');
        insertFileButton.classList.add("btn", "btn-primary", "pdf-actions_insert-file-button");
        insertFileButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-plus" viewBox="0 0 16 16">
                                <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                                <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                            </svg>`;
        insertFileButton.onclick = this.insertFileButtonCallback;
        insertFileButtonContainer.appendChild(insertFileButton);
        
        div.appendChild(insertFileButtonContainer);
        
        // add this button to every element, but only show it on the last one :D
        const insertFileButtonRightContainer = document.createElement('div');
        insertFileButtonRightContainer.classList.add(
            "pdf-actions_insert-file-button-container",
            rightDirection,
            `align-center-${rightDirection}`);
        
        const insertFileButtonRight = document.createElement('button');
        insertFileButtonRight.classList.add("btn", "btn-primary", "pdf-actions_insert-file-button");
        insertFileButtonRight.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-plus" viewBox="0 0 16 16">
                                <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                                <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                                insertFileButtonRight</svg>`;
        insertFileButtonRight.onclick = () => addPdfs();
        insertFileButtonRightContainer.appendChild(insertFileButtonRight);

        div.appendChild(insertFileButtonRightContainer);

        const adaptPageNumber = (pageNumber, div) => {
        const pageNumberElement = document.createElement('span');
        pageNumberElement.classList.add('page-number');
        pageNumberElement.textContent = pageNumber;

        div.insertBefore(pageNumberElement, div.firstChild);
        };

        div.addEventListener('mouseenter', () => {
               const pageNumber = Array.from(div.parentNode.children).indexOf(div) + 1;
               adaptPageNumber(pageNumber, div);
        });

        div.addEventListener('mouseleave', () => {
                const pageNumberElement = div.querySelector('.page-number');
                if (pageNumberElement) {
                    div.removeChild(pageNumberElement);
                }
        });

        return div;
    }
}

export default PdfActionsManager;