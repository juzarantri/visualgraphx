"use client";
import React from "react";
import { List, Button, Input } from "antd";
import type { FC } from "react";

export type RecordRow = any;

const RecordsList: FC<{
  records: RecordRow[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onEdit: (r: RecordRow) => void;
}> = ({ records, loading, search, onSearchChange, onRefresh, onEdit }) => {
  return (
    <div style={{ width: 380 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Input
          placeholder="Search product_ref or title"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Button onClick={onRefresh}>Refresh</Button>
      </div>

      <List
        size="small"
        loading={loading}
        pagination={{ pageSize: 10 }}
        dataSource={records}
        renderItem={(item) => (
          <List.Item
            key={item.product_ref}
            actions={[
              <Button key="edit" size="small" onClick={() => onEdit(item)}>
                Edit
              </Button>,
              <Button
                key="faq"
                size="small"
                onClick={() => onEdit({ ...item, _openFaqPreview: true })}
              >
                FAQ ({(item.faq || []).length})
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={<strong>{item.product_ref}</strong>}
              description={<span style={{ color: "#666" }}>{item.title}</span>}
            />
            <div style={{ fontSize: 12, color: "#999" }}>
              {item.created_at
                ? new Date(item.created_at).toLocaleDateString()
                : ""}
            </div>
          </List.Item>
        )}
      />
    </div>
  );
};

export default RecordsList;
