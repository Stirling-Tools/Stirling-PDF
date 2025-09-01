module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    // Custom rules to prevent dangerous file.name as ID patterns
    'no-file-name-as-id': 'error',
    'prefer-file-with-id': 'warn'
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Prevent file.name being used where FileId is expected
        'no-restricted-syntax': [
          'error',
          {
            selector: 'MemberExpression[object.name="file"][property.name="name"]',
            message: 'Avoid using file.name directly. Use FileWithId.fileId or safeGetFileId() instead to prevent ID collisions.'
          },
          {
            selector: 'CallExpression[callee.name="createOperation"] > ArrayExpression > CallExpression[callee.property.name="map"] > ArrowFunctionExpression > MemberExpression[object.name="f"][property.name="name"]',
            message: 'Dangerous pattern: Using file.name as ID in createOperation. Use FileWithId.fileId instead.'
          },
          {
            selector: 'ArrayExpression[elements.length>0] CallExpression[callee.property.name="map"] > ArrowFunctionExpression > MemberExpression[property.name="name"]',
            message: 'Potential file.name as ID usage detected. Ensure proper FileId usage instead of file.name.'
          }
        ]
      }
    }
  ],
  settings: {
    // Custom settings for our file ID validation
    'file-id-validation': {
      // Functions that should only accept FileId, not strings
      'file-id-only-functions': [
        'recordOperation',
        'markOperationApplied', 
        'markOperationFailed',
        'removeFiles',
        'updateFileRecord',
        'pinFile',
        'unpinFile'
      ],
      // Functions that should accept FileWithId instead of File
      'file-with-id-functions': [
        'createOperation',
        'executeOperation',
        'isFilePinned'
      ]
    }
  }
};