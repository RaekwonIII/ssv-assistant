import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { ActivityLevel, FileParseReport, KeystoreEntry } from "../model/types";
import { parseKeystoreFiles } from "../utils/keystore";
import { readErrorMessage } from "../utils/errors";

type UseKeystoreUploadArgs = {
  appendActivity: (level: ActivityLevel, message: string) => void;
  onBeforeParse?: () => void;
};

export function useKeystoreUpload(args: UseKeystoreUploadArgs) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [keystoreEntries, setKeystoreEntries] = useState<KeystoreEntry[]>([]);
  const [fileParseReports, setFileParseReports] = useState<FileParseReport[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const latestUploadTokenRef = useRef(0);

  const parseSelectedFiles = async (files: File[]) => {
    latestUploadTokenRef.current += 1;
    const uploadToken = latestUploadTokenRef.current;

    setSelectedFiles(files);
    args.onBeforeParse?.();

    if (files.length === 0) {
      setKeystoreEntries([]);
      setFileParseReports([]);
      return;
    }

    try {
      const { entries, reports } = await parseKeystoreFiles(files);

      if (uploadToken !== latestUploadTokenRef.current) {
        return;
      }

      setKeystoreEntries(entries);
      setFileParseReports(reports);

      if (entries.length > 0) {
        args.appendActivity(
          "success",
          `Parsed ${entries.length} keystore entr${
            entries.length === 1 ? "y" : "ies"
          } from ${files.length} file${files.length === 1 ? "" : "s"}.`,
        );
      } else {
        args.appendActivity("error", "No valid keystore entries were detected.");
      }
    } catch (error) {
      const message = readErrorMessage(error);
      args.appendActivity("error", `Failed to parse selected files: ${message}`);
    }
  };

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await parseSelectedFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await parseSelectedFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  return {
    selectedFiles,
    keystoreEntries,
    fileParseReports,
    isDragging,
    onFileInputChange,
    onDrop,
    onDragOver,
    onDragLeave,
  };
}
