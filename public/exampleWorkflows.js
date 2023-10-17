// JSON Representation of this Node Tree:
// https://discord.com/channels/1068636748814483718/1099390571493195898/1118192754103693483
// https://cdn.discordapp.com/attachments/1099390571493195898/1118192753759764520/image.png?ex=6537dba7&is=652566a7&hm=dc46820ef7c34bc37424794966c5f66f93ba0e15a740742c364d47d31ea119a9&
export const discordWorkflow = {
    outputOptions: {
        zip: false
    },
    operations: [
        {
            type: "extract",
            values: { "index": "1" },
            operations: [
                {
                    type: "removeObjects",
                    values: { "objectNames": "photo, josh" },
                    operations: [
                        {
                            type: "wait",
                            values: { "id": 1 }
                        }
                    ]
                }
            ]
        },
        {
            type: "extract",
            values: { "index": "2-5" },
            operations: [ 
                {
                    type: "fillField",
                    values: { "objectName": "name", "inputValue": "Josh" },
                    operations: [
                        {
                            type: "wait",
                            values: { "id": 1 }
                        }
                    ]
                }
            ]
        },
        {
            type: "done", // This gets called when the other merge-ops with the same id finish.
            values: { "id": 1 },
            operations: [
                {
                    type: "merge",
                    values: {},
                    operations: []
                }
            ]
        },
        {
            type: "extractImages",
            values: {},
            operations: []
        },
        {
            type: "merge",
            values: {},
            operations: [
                {
                    type: "transform",
                    values: { "scale": "2x", "rotation": "90deg" },
                    operations: []
                }
            ]
        }
    ]
}

// This will merge all input files into one giant document
export const mergeOnly = {
    outputOptions: {
        zip: false
    },
    operations: [
        {
            type: "merge",
            values: {},
            operations: []
        }
    ]
}

// Extract Pages and store them in a new document
export const extractOnly = {
    outputOptions: {
        zip: false
    },
    operations: [
        {
            type: "extract",
            values: { "pagesToExtractArray": [0, 2] },
            operations: []
        }
    ]
}

// Split a document up into multiple documents
export const splitOnly = {
    outputOptions: {
        zip: false
    },
    operations: [
        {
            type: "split",
            values: { "pagesToSplitAfterArray": [2, 10] },
            operations: []
        }
    ]
}

// Split a document up into multiple documents
export const rotateOnly = {
    outputOptions: {
        zip: false
    },
    operations: [
        {
            type: "rotate",
            values: { "rotation": -90 },
            operations: []
        }
    ]
}