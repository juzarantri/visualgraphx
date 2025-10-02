"use client";
import React from "react";
import { Drawer, Form, Input, Button } from "antd";
import type { FC } from "react";

const EditDrawer: FC<{
  open: boolean;
  record: any | null;
  onClose: () => void;
  onSave: (values: any) => Promise<void>;
}> = ({ open, record, onClose, onSave }) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (record) {
      const copy = { ...record };
      if (copy.faq && typeof copy.faq !== "string") {
        try {
          copy.faq = JSON.stringify(copy.faq, null, 2);
        } catch (e) {
          // ignore
        }
      }
      form.setFieldsValue(copy);
    } else form.resetFields();
  }, [record, form]);

  return (
    <Drawer
      width={640}
      onClose={onClose}
      open={open}
      title={record ? `Edit ${record.product_ref}` : "Edit record"}
    >
      {record && (
        <Form form={form} layout="vertical">
          <Form.Item label="Product Ref" name="product_ref">
            <Input disabled />
          </Form.Item>
          <Form.Item label="Title" name="title">
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item label="Price" name="price">
            <Input />
          </Form.Item>
          <Form.Item label="URL" name="url">
            <Input />
          </Form.Item>
          <Form.Item label="Image URL" name="image_url">
            <Input />
          </Form.Item>
          <Form.Item label="Technical Data" name="technical_data">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="FAQ (JSON array)" name="faq">
            <Input.TextArea
              rows={6}
              placeholder='[ { "q": "...", "a":"..." } ]'
            />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              onClick={async () => {
                const vals = await form.validateFields();
                await onSave(vals);
              }}
            >
              Save
            </Button>
          </div>
        </Form>
      )}
    </Drawer>
  );
};

export default EditDrawer;
