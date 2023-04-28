class PdfActionsManager {
    callbacks;
    pageDirection;
    constructor(id, { movePageTo, addPdfs, rotateElement }) {
        this.pageDirection = document.documentElement.getAttribute("lang-direction");
        const moveUpButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            
            const sibling = imgContainer.previousSibling;
            if (sibling) {
                movePageTo(imgContainer, sibling, true);
            }
        };
        const moveDownButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            const sibling = imgContainer.nextSibling;
            if (sibling) {
                movePageTo(imgContainer, sibling.nextSibling, true);
            }
        };
        const rotateCCWButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            const img = imgContainer.querySelector("img");
            
            rotateElement(img, -90)
        };
        const rotateCWButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            const img = imgContainer.querySelector("img");
            
            rotateElement(img, 90)
        };
        const deletePageButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            pagesContainer.removeChild(imgContainer);
        };
        const insertFileButtonCallback = e => {
            var imgContainer = e.target;
            while (!imgContainer.classList.contains(id)) {
                imgContainer = imgContainer.parentNode;
            }
            addPdfs(imgContainer)
        };

        this.callbacks = {
            moveUpButtonCallback,
            moveDownButtonCallback,
            rotateCCWButtonCallback,
            rotateCWButtonCallback,
            deletePageButtonCallback,
            insertFileButtonCallback
        }
    }

    attachPDFActions(div) {
        const leftDirection = this.pageDirection === 'rtl' ? 'right' : 'left'
        const rightDirection = this.pageDirection === 'rtl' ? 'left' : 'right'
        const buttonContainer = document.createElement('div');

        buttonContainer.classList.add("button-container");
                    
        const moveUp = document.createElement('button');
        moveUp.classList.add("move-left-button","btn", "btn-secondary");
        moveUp.innerHTML = `<i class="bi bi-arrow-${leftDirection}-short"></i>`;
        moveUp.onclick = this.callbacks.moveUpButtonCallback;
        buttonContainer.appendChild(moveUp);

        const moveDown = document.createElement('button');
        moveDown.classList.add("move-right-button","btn", "btn-secondary");
        moveDown.innerHTML = `<i class="bi bi-arrow-${rightDirection}-short"></i>`;
        moveDown.onclick = this.callbacks.moveDownButtonCallback;
        buttonContainer.appendChild(moveDown);
        
        const rotateCCW = document.createElement('button');
        rotateCCW.classList.add("btn", "btn-secondary");
        rotateCCW.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-counterclockwise" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z" />
                            <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z" />
                        </svg>`;
        rotateCCW.onclick = this.callbacks.rotateCCWButtonCallback;
        buttonContainer.appendChild(rotateCCW);

        const rotateCW = document.createElement('button');
        rotateCW.classList.add("btn", "btn-secondary");
        rotateCW.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-clockwise" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                        </svg>`;
        rotateCW.onclick = this.callbacks.rotateCWButtonCallback;
        buttonContainer.appendChild(rotateCW);

        const deletePage = document.createElement('button');
        deletePage.classList.add("btn", "btn-danger");
        deletePage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                        </svg>`;
        deletePage.onclick = this.callbacks.deletePageButtonCallback;
        buttonContainer.appendChild(deletePage);

        div.appendChild(buttonContainer);

        const insertFileButtonContainer = document.createElement('div');
                
        insertFileButtonContainer.classList.add(
            "insert-file-button-container",
            leftDirection,
            `align-center-${leftDirection}`);
        
        const insertFileButton = document.createElement('button');
        insertFileButton.classList.add("btn", "btn-primary", "insert-file-button");
        insertFileButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-plus" viewBox="0 0 16 16">
                                <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                                <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                            </svg>`;
        insertFileButton.onclick = this.callbacks.insertFileButtonCallback;
        insertFileButtonContainer.appendChild(insertFileButton);
        
        div.appendChild(insertFileButtonContainer);
        
        // add this button to every element, but only show it on the last one :D
        const insertFileButtonRightContainer = document.createElement('div');
        insertFileButtonRightContainer.classList.add(
            "insert-file-button-container",
            rightDirection,
            `align-center-${rightDirection}`);
        
        const insertFileButtonRight = document.createElement('button');
        insertFileButtonRight.classList.add("btn", "btn-primary", "insert-file-button");
        insertFileButtonRight.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-plus" viewBox="0 0 16 16">
                                <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                                <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                                insertFileButtonRight</svg>`;
        insertFileButtonRight.onclick = () => addPdfs();
        insertFileButtonRightContainer.appendChild(insertFileButtonRight);

        div.appendChild(insertFileButtonRightContainer);
    }
}

export default PdfActionsManager;