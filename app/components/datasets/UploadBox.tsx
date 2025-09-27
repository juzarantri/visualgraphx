"use client";
import React from "react";
import { Upload, Button } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { FC } from "react";

const UploadBox: FC<{
  onUploadFile: (f: File) => void;
  uploading: boolean;
}> = ({ onUploadFile, uploading }) => {
  return (
    <div>
      <Upload.Dragger
        beforeUpload={(file) => {
          onUploadFile(file);
          return false;
        }}
        showUploadList={false}
        accept=".csv,.json,text/csv,application/json"
        style={{ width: 220 }}
      >
        <div style={{ padding: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Drag & drop a file or click to upload
          </p>
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={uploading}
          >
            Upload dataset
          </Button>
        </div>
      </Upload.Dragger>
    </div>
  );
};

export default UploadBox;
