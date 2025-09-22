"use client";
import React, { useState } from "react";
import { Card, Upload, Button, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { UploadOutlined } from "@ant-design/icons";

type Dataset = {
  id: string;
  name: string;
  rowCount: number;
  preview: Record<string, string>[];
};

type RowType = Record<string, string | number> & { key: number };

export default function Datasets() {
  const [dataset, setDataset] = useState<Dataset | null>(() => {
    try {
      const raw = localStorage.getItem("vgx_dataset");
      return raw ? (JSON.parse(raw) as Dataset) : null;
    } catch {
      return null;
    }
  });

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      try {
        let rows: Record<string, string>[] = [];
        if (
          file.name.endsWith(".json") ||
          text.trim().startsWith("{") ||
          text.trim().startsWith("[")
        ) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) rows = parsed;
          else rows = [parsed];
        } else {
          // very small CSV parser (comma-separated)
          const lines = text.split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) throw new Error("Empty file");
          const headers = lines[0].split(",").map((h) => h.trim());
          rows = lines.slice(1).map((line) => {
            const cols = line.split(",");
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => (obj[h] = cols[i] ? cols[i].trim() : ""));
            return obj;
          });
        }

        const preview = rows.slice(0, 5);
        const saved: Dataset = {
          id: String(Date.now()),
          name: file.name,
          rowCount: rows.length,
          preview,
        };
        localStorage.setItem("vgx_dataset", JSON.stringify(saved));
        setDataset(saved);
        message.success(
          `${file.name} parsed — ${rows.length} rows (preview saved)`
        );
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        message.error("Failed to parse file: " + msg);
      }
    };
    reader.readAsText(file);
    return false; // prevent auto upload
  };

  const columns: ColumnsType<RowType> =
    dataset && dataset.preview.length > 0
      ? (Object.keys(dataset.preview[0]).map((key) => ({
          title: key,
          dataIndex: key,
          key,
        })) as ColumnsType<RowType>)
      : [];

  return (
    <Card variant="borderless">
      <p>Upload a CSV or JSON dataset to use for training/preview.</p>

      <Upload
        beforeUpload={(file) => {
          handleUpload(file);
          return false;
        }}
        showUploadList={false}
        accept=".csv,.json,text/csv,application/json"
      >
        <Button icon={<UploadOutlined />}>Select dataset file</Button>
      </Upload>

      <div style={{ marginTop: 16 }}>
        {dataset ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <strong>{dataset.name}</strong> — {dataset.rowCount} rows
            </div>
            <Table
              dataSource={dataset.preview.map((r, i) => ({ key: i, ...r }))}
              columns={columns}
              pagination={false}
            />
          </>
        ) : (
          <div style={{ color: "#666" }}>No dataset uploaded yet.</div>
        )}
      </div>
    </Card>
  );
}
