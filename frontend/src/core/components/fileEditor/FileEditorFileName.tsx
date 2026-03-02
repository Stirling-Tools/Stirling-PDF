import React from 'react';
import { StirlingFileStub } from '@app/types/fileContext';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface FileEditorFileNameProps {
  file: StirlingFileStub;
}

const FileEditorFileName = ({ file }: FileEditorFileNameProps) => (
  <PrivateContent>{file.name}</PrivateContent>
);

export default FileEditorFileName;
