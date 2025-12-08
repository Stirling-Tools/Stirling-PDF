import { useTranslation } from 'react-i18next';
import '@app/components/tools/validateSignature/reportView/styles.css';
import FieldBlock from '@app/components/tools/validateSignature/reportView/FieldBlock';

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return value;
};

const formatFileSize = (bytes?: number | null) => {
  if (bytes === undefined || bytes === null) return '--';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, exponent);
  return `${size.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const FileSummaryHeader = ({
  fileSize,
  createdAt,
  totalSignatures,
  lastSignatureDate,
}: {
  fileSize?: number | null;
  createdAt?: string | null;
  totalSignatures: number;
  lastSignatureDate?: string | null;
}) => {
  const { t } = useTranslation();
  const infoBlocks = [
    FieldBlock(t('files.size', 'File Size'), formatFileSize(fileSize ?? null)),
    FieldBlock(t('files.created', 'Created'), createdAt || '-'),
    FieldBlock(t('validateSignature.signatureDate', 'Signature Date'), formatDate(lastSignatureDate)),
    FieldBlock(t('validateSignature.totalSignatures', 'Total Signatures'), totalSignatures.toString()),
  ];

  return <div className="grid-container">{infoBlocks}</div>;
};

export default FileSummaryHeader;

