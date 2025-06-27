import React, { useState, useEffect } from "react";
import {
    Button,
    Stack,
    Text,
    Group,
    Alert,
    Divider,
    Select,
    NumberInput,
} from "@mantine/core";
import { ArrowDownward } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { FileWithUrl } from "../types/file";
import { fileStorage } from "../services/fileStorage";

export interface ConvertPanelProps {
    files: FileWithUrl[];
    setDownloadUrl: (url: string) => void;
    params: {
        fromFormat: string;
        toFormat: string;
        imageOptions?: {
            colorType: string;
            dpi: number;
            singleOrMultiple: string;
        };
        officeOptions?: {
            outputFormat: string;
        };
    };
    updateParams: (newParams: Partial<ConvertPanelProps["params"]>) => void;
}

const ConvertPanel: React.FC<ConvertPanelProps> = ({ files, setDownloadUrl, params, updateParams }) => {
    const { t } = useTranslation();
    const [downloadUrl, setLocalDownloadUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    const [fromFormat, setFromFormat] = useState(params.fromFormat || "");
    const [toFormat, setToFormat] = useState(params.toFormat || "");
    const [colorType, setColorType] = useState(params.imageOptions?.colorType || "color");
    const [dpi, setDpi] = useState(params.imageOptions?.dpi || 300);
    const [singleOrMultiple, setSingleOrMultiple] = useState(params.imageOptions?.singleOrMultiple || "multiple");
    const [outputFormat, setOutputFormat] = useState(params.officeOptions?.outputFormat || "");

    useEffect(() => {
        if (files.length > 0 && !fromFormat) {
            const firstFile = files[0];
            const detectedFormat = detectFileFormat(firstFile.name);
            setFromFormat(detectedFormat);
            updateParams({ fromFormat: detectedFormat });
        }
    }, [files, fromFormat]);
    
    const detectFileFormat = (filename: string): string => {
        const extension = filename.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'pdf': return 'pdf';
            case 'doc': case 'docx': return 'office';
            case 'xls': case 'xlsx': return 'office';
            case 'ppt': case 'pptx': return 'office';
            case 'odt': case 'ods': case 'odp': return 'office';
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'bmp': case 'tiff': case 'webp': return 'image';
            case 'html': case 'htm': return 'html';
            case 'md': return 'markdown';
            case 'txt': case 'rtf': return 'text';
            default: return 'unknown';
        }
    };
    
    const getAvailableToFormats = (from: string): string[] => {
        switch (from) {
            case 'pdf':
                return ['image', 'office-word', 'office-presentation', 'office-text', 'html', 'xml'];
            case 'office':
                return ['pdf'];
            case 'image':
                return ['pdf'];
            case 'html':
                return ['pdf'];
            case 'markdown':
                return ['pdf'];
            case 'text':
                return ['pdf'];
            default:
                return [];
        }
    };
    
    const getApiEndpoint = (from: string, to: string): string => {
        if (from === 'office' && to === 'pdf') {
            return '/api/v1/convert/file/pdf';
        } else if (from === 'pdf' && to === 'image') {
            return '/api/v1/convert/pdf/img';
        } else if (from === 'image' && to === 'pdf') {
            return '/api/v1/convert/img/pdf';
        } else if (from === 'pdf' && to === 'office-word') {
            return '/api/v1/convert/pdf/word';
        } else if (from === 'pdf' && to === 'office-presentation') {
            return '/api/v1/convert/pdf/presentation';
        } else if (from === 'pdf' && to === 'office-text') {
            return '/api/v1/convert/pdf/text';
        } else if (from === 'pdf' && to === 'html') {
            return '/api/v1/convert/pdf/html';
        } else if (from === 'pdf' && to === 'xml') {
            return '/api/v1/convert/pdf/xml';
        } else if (from === 'html' && to === 'pdf') {
            return '/api/v1/convert/html/pdf';
        } else if (from === 'markdown' && to === 'pdf') {
            return '/api/v1/convert/markdown/pdf';
        }
        return '';
    };

    const handleConvert = async () => {
        if (files.length === 0) {
            setErrorMessage(t("convert.errorNoFiles", "Please select at least one file to convert."));
            return;
        }
        
        if (!fromFormat || !toFormat) {
            setErrorMessage(t("convert.errorNoFormat", "Please select both source and target formats."));
            return;
        }
        
        const endpoint = getApiEndpoint(fromFormat, toFormat);
        if (!endpoint) {
            setErrorMessage(
                t("convert.errorNotSupported", { from: fromFormat, to: toFormat, defaultValue: `Conversion from ${fromFormat} to ${toFormat} is not supported.` })
            );
            return;
        }

        const formData = new FormData();

        // Handle IndexedDB files
        for (const file of files) {
            if (!file.id) {
                console.warn("File without ID found, skipping:", file.name);
                continue;
            }
            const storedFile = await fileStorage.getFile(file.id);
            if (!storedFile) {
                console.warn("Stored file not found in IndexedDB for ID:", file.id);
                continue;
            }
            const blob = new Blob([storedFile.data], { type: storedFile.type });
            const actualFile = new File([blob], storedFile.name, {
                type: storedFile.type,
                lastModified: storedFile.lastModified,
            });
            formData.append("fileInput", actualFile);
            
        }
        
        // Add conversion-specific parameters
        if (toFormat === 'image') {
            formData.append("imageFormat", "png");
            formData.append("colorType", colorType);
            formData.append("dpi", dpi.toString());
            formData.append("singleOrMultiple", singleOrMultiple);
        } else if (fromFormat === 'pdf' && toFormat.startsWith('office')) {
            if (toFormat === 'office-word') {
                formData.append("outputFormat", outputFormat || "docx");
            } else if (toFormat === 'office-presentation') {
                formData.append("outputFormat", outputFormat || "pptx");
            } else if (toFormat === 'office-text') {
                formData.append("outputFormat", outputFormat || "txt");
            }
        } else if (fromFormat === 'image' && toFormat === 'pdf') {
            formData.append("fitOption", "fillPage");
            formData.append("colorType", colorType);
            formData.append("autoRotate", "true");
        }

        setIsLoading(true);
        setErrorMessage(null);

        try {
            console.log("Converting files from", fromFormat, "to", toFormat, "using endpoint:", endpoint);
            console.log("Form data:", Array.from(formData.entries()).map(([key, value]) => `${key}: ${value}`));
            const response = await fetch(endpoint, {    
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Conversion failed: ${errorText}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setLocalDownloadUrl(url);
        } catch (error: any) {
            setErrorMessage(error.message || "Unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFromFormatChange = (value: string | null) => {
        if (value) {
            setFromFormat(value);
            setToFormat("");
            // Reset all format-specific options when source format changes
            setColorType("color");
            setDpi(300);
            setSingleOrMultiple("multiple");
            setOutputFormat("");
            updateParams({ 
                fromFormat: value, 
                toFormat: "",
                imageOptions: { colorType: "color", dpi: 300, singleOrMultiple: "multiple" },
                officeOptions: { outputFormat: "" }
            });
        }
    };
    
    const handleToFormatChange = (value: string | null) => {
        if (value) {
            setToFormat(value);
            // Reset format-specific options when target format changes
            setColorType("color");
            setDpi(300);
            setSingleOrMultiple("multiple");
            setOutputFormat("");
            updateParams({ 
                fromFormat, 
                toFormat: value,
                imageOptions: { colorType: "color", dpi: 300, singleOrMultiple: "multiple" },
                officeOptions: { outputFormat: "" }
            });
        }
    };

    return (
        <Stack>
            <Text size="sm">
                {t("convert.desc", "Convert files between different formats")}
            </Text>
            <Divider my="sm" />

            <Stack gap="md">
                <Stack gap="sm" align="center">
                    <div style={{ width: '100%' }}>
                        <Text size="sm" fw={500} mb="xs">
                            {t("convert.convertFrom", "Convert from")}:
                        </Text>
                        <Select
                            value={fromFormat}
                            onChange={handleFromFormatChange}
                            data={[
                                { value: 'pdf', label: 'PDF' },
                                { value: 'office', label: t("convert.officeDocs", "Office Documents (Word, Excel, PowerPoint)") },
                                { value: 'image', label: t("convert.imagesExt", "Images (JPG, PNG, etc.)") },
                                { value: 'html', label: 'HTML' },
                                { value: 'markdown', label: t("convert.markdown", "Markdown") },
                                { value: 'text', label: t("convert.textRtf", "Text/RTF") },
                            ]}
                        />
                    </div>
                    <div style={{ width: '100%' }}>
                        <Text size="sm" fw={500} mb="xs">
                            {t("convert.convertTo", "Convert to")}:
                        </Text>
                        <Select
                            value={toFormat}
                            onChange={handleToFormatChange}
                            data={getAvailableToFormats(fromFormat).map(format => ({
                                value: format,
                                label: format === 'office-word' ? t("convert.wordDoc") :
                                       format === 'office-presentation' ? t("convert.powerPointPresentation", "PowerPoint Presentation") :
                                       format === 'office-text' ? t("convert.textRtf") :
                                       format === 'image' ? t("convert.images") :
                                       format === 'pdf' ? 'PDF' :
                                       format.charAt(0).toUpperCase() + format.slice(1)
                            }))}
                            disabled={!fromFormat}
                        />
                    </div>
                </Stack>

                {(toFormat === 'image' || (fromFormat === 'pdf' && toFormat?.startsWith('office')) || (fromFormat === 'image' && toFormat === 'pdf')) && (
                    <Divider />
                )}

                {toFormat === 'image' && (
                    <Stack gap="sm">
                        <Text size="sm" fw={500}>{t("convert.imageOptions", "Image Options")}:</Text>
                        <Group grow>
                            <Select
                                label={t("convert.colorType", "Color Type")}
                                value={colorType}
                                onChange={(val) => val && setColorType(val)}
                                data={[
                                    { value: 'color', label: t("convert.color", "Color") },
                                    { value: 'greyscale', label: t("convert.greyscale", "Greyscale") },
                                    { value: 'blackwhite', label: t("convert.blackwhite", "Black & White") },
                                ]}
                            />
                            <NumberInput
                                label={t("convert.dpi", "DPI")}
                                value={dpi}
                                onChange={(val) => typeof val === 'number' && setDpi(val)}
                                min={72}
                                max={600}
                                step={1}
                            />
                        </Group>
                        <Select
                            label={t("convert.output", "Output")}
                            value={singleOrMultiple}
                            onChange={(val) => val && setSingleOrMultiple(val)}
                            data={[
                                { value: 'single', label: t("convert.single") },
                                { value: 'multiple', label: t("convert.multiple") },
                            ]}
                        />
                    </Stack>
                )}

                {fromFormat === 'pdf' && toFormat?.startsWith('office') && (
                    <Stack gap="sm">
                        <Text size="sm" fw={500}>{t("convert.outputOptions", "Output Options")}:</Text>
                        <Select
                            label={t("convert.fileFormat")}
                            value={outputFormat}
                            onChange={(val) => val && setOutputFormat(val)}
                            data={
                                toFormat === 'office-word' ? [
                                    { value: 'docx', label: t("convert.wordDocExt") },
                                    { value: 'odt', label: t("convert.odtExt") },
                                ] :
                                toFormat === 'office-presentation' ? [
                                    { value: 'pptx', label: t("convert.pptExt") },
                                    { value: 'odp', label: t("convert.odpExt") },
                                ] :
                                toFormat === 'office-text' ? [
                                    { value: 'txt', label: t("convert.txtExt") },
                                    { value: 'rtf', label: t("convert.rtfExt") },
                                ] : []
                            }
                        />
                    </Stack>
                )}

                {fromFormat === 'image' && toFormat === 'pdf' && (
                    <Stack gap="sm">
                        <Text size="sm" fw={500}>{t("convert.pdfOptions", "PDF Options")}:</Text>
                        <Select
                            label={t("convert.colorType")}
                            value={colorType}
                            onChange={(val) => val && setColorType(val)}
                            data={[
                                { value: 'color', label: t("convert.color") },
                                { value: 'greyscale', label: t("convert.greyscale") },
                                { value: 'blackwhite', label: t("convert.blackwhite") },
                            ]}
                        />
                    </Stack>
                )}

                <Divider my="sm" />
                <div>
                    <Text size="sm" fw={500} mb="xs">
                        {t("convert.selectedFiles", "Selected files")}: ({files.length}):
                    </Text>
                    <Stack gap={4}>
                        {files.map((file, index) => (
                            <Group key={index} gap="xs">
                                <Text size="sm">{file.name}</Text>
                            </Group>
                        ))}
                        {files.length === 0 && (
                            <Text size="sm" c="dimmed">
                                {t("convert.noFileSelected", "No files selected for conversion. Please add files to convert.")}
                            </Text>
                        )}
                    </Stack>
                </div>

                <Button 
                    onClick={handleConvert} 
                    loading={isLoading} 
                    disabled={files.length === 0 || !fromFormat || !toFormat || isLoading}
                    size="md"
                >
                    {isLoading ? t("convert.converting", "Converting...") : t("convert.convertFiles", "Convert Files")}
                </Button>

                {errorMessage && (
                    <Alert color="red">
                        {errorMessage}
                    </Alert>
                )}

                {downloadUrl && (
                    <Button 
                        component="a" 
                        href={downloadUrl} 
                        download 
                        color="green" 
                        variant="light"
                        size="md"
                    >
                        {t("convert.downloadConverted", "Download Converted File")} <ArrowDownward />
                    </Button>
                )}
            </Stack>
        </Stack>
    );
};

export default ConvertPanel;
