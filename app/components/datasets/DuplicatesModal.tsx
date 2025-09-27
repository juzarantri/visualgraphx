"use client";
import React from "react";
import { Modal, Table, Button, Space, Typography } from "antd";
import type { FC } from "react";

const DuplicatesModal: FC<{
  open: boolean;
  items: any[];
  highlightedRef: string | null;
  onClose: () => void;
  onEdit: (r: any) => void;
}> = ({ open, items, highlightedRef, onClose, onEdit }) => {
  return (
    <Modal
      open={open}
      title={`Duplicates (${items.length})`}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      <Table
        dataSource={items}
        rowKey={(r) => r.product_ref}
        pagination={{ pageSize: 8 }}
        rowClassName={(record) =>
          record.product_ref === highlightedRef ? "vgx-highlight-row" : ""
        }
        columns={[
          {
            title: "Product Ref",
            dataIndex: "product_ref",
            key: "product_ref",
          },
          {
            title: "Title",
            dataIndex: "title",
            key: "title",
            render: (v) => <Typography.Text>{v}</Typography.Text>,
          },
          {
            title: "Description",
            dataIndex: "description",
            key: "description",
            render: (v) => (
              <Typography.Text type="secondary">{v}</Typography.Text>
            ),
          },
          {
            title: "Price",
            dataIndex: "price",
            key: "price",
            render: (p) => (p ? `$${p}` : ""),
          },
          {
            title: "Actions",
            key: "actions",
            render: (_: any, record: any) => (
              <Space>
                <Button size="small" onClick={() => onEdit(record)}>
                  Edit
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default DuplicatesModal;
