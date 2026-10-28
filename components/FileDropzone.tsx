"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { UploadCloud } from "lucide-react";
import styles from "./FileDropzone.module.css";

export type FileDropzoneProps = {
  onFilesSelected: (files: File[]) => void;
  title: string;
  subtitle?: string;
  accept?: string;
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
};

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const rules = accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function FileDropzone({
  onFilesSelected,
  title,
  subtitle,
  accept,
  maxFiles = 1,
  maxSize = 10 * 1024 * 1024,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = (list: FileList | null) => {
    setError("");
    if (!list || !list.length) return;
    const selected = Array.from(list);
    if (selected.length > maxFiles) {
      setError(`Maksimal ${maxFiles} file.`);
      return;
    }
    const wrongType = selected.find((file) => !matchesAccept(file, accept));
    if (wrongType) {
      setError(`Tipe file ${wrongType.name} tidak didukung.`);
      return;
    }
    const tooLarge = selected.find((file) => file.size > maxSize);
    if (tooLarge) {
      setError(
        `Ukuran ${tooLarge.name} melebihi ${Math.round(
          maxSize / 1024 / 1024,
        )} MB.`,
      );
      return;
    }
    onFilesSelected(selected);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={`${styles.dropzone} ${dragging ? styles.dragging : ""} ${
          disabled ? styles.disabled : ""
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <UploadCloud className={styles.icon} size={26} />
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
        <small>
          {accept ? `Format: ${accept.replace(/application\//g, "")} · ` : ""}
          Maks {Math.round(maxSize / 1024 / 1024)} MB
        </small>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          disabled={disabled}
          hidden
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
