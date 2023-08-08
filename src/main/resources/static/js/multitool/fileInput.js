const addFileDragListener = (callback) => {
    let overlay;
    let dragCounter = 0;

    const dragenterListener = function() {
        dragCounter++;
        if (!overlay) {
            // Create and show the overlay
            overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = 0;
            overlay.style.left = 0;
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'rgba(0, 0, 0, 0.5)';
            overlay.style.color = '#fff';
            overlay.style.zIndex = '1000';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.pointerEvents = 'none';
            overlay.innerHTML = '<p>Drop files anywhere to upload</p>';
            document.getElementById('content-wrap').appendChild(overlay);
        }
    };

    const dragleaveListener = function() {
        dragCounter--;
        if (dragCounter === 0) {
            // Hide and remove the overlay
            if (overlay) {
                overlay.remove();
                overlay = null;
            }
        }
    };

    const dropListener = function(e) {

        const dt = e.dataTransfer;
        const files = dt.files;
        callback(files).catch((err) => {
            console.error(err);
            //maybe
        }).finally(() => {
            if (overlay) {
                overlay.remove();
                overlay = null;
            }
        });
    };

    // Prevent default behavior for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    document.body.addEventListener('dragenter', dragenterListener);
    document.body.addEventListener('dragleave', dragleaveListener);
    // Add drop event listener
    document.body.addEventListener('drop', dropListener);
}

export default addFileDragListener;