// JSON Representation of this Node Tree:
// https://discord.com/channels/1068636748814483718/1099390571493195898/1118192754103693483
// https://cdn.discordapp.com/attachments/1099390571493195898/1118192753759764520/image.png?ex=6537dba7&is=652566a7&hm=dc46820ef7c34bc37424794966c5f66f93ba0e15a740742c364d47d31ea119a9&

export const testWorkflow = {
    outputOptions: {
        zip: false,
        awaitAllDone: true
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
                    type: "merge", // This gets called when the other merge-ops with the same id finish.
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
            type: "merge", // This gets called when the other merge-ops with the same id finish.
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