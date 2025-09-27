"use client";
import React, { useEffect, useState } from "react";
import { Card, Button, message, Divider, Input, Space, Form, Spin, Typography } from "antd";
import type { FC } from "react";
import styles from "../chats/Chat.module.css";
import { UploadOutlined } from "@ant-design/icons";
import RecordsList from "./RecordsList";
import UploadBox from "./UploadBox";
import DuplicatesModal from "./DuplicatesModal";
import EditDrawer from "./EditDrawer";

type UploadResult = { inserted: number; duplicates: any[] } | null;

const Datasets: FC = () => {
  const [uploadResult, setUploadResult] = useState<UploadResult>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [totalUploaded, setTotalUploaded] = useState<number | null>(null);
  const [editingFromModal, setEditingFromModal] = useState(false);
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void loadRecords();
  }, []);

  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const res = await fetch("/api/records/list");
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to load records");
      setRecords(j.records || []);
    } catch (e) {
      console.error(e);
      message.error("Failed to load records");
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      try {
        let rows: Record<string, any>[] = [];
        if (
          file.name.endsWith(".json") ||
          text.trim().startsWith("{") ||
          text.trim().startsWith("[")
        ) {
          const parsed = JSON.parse(text);
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } else {
          // naive CSV parser
          const lines = text.split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) throw new Error("Empty file");
          const headers = lines[0].split(",").map((h) => h.trim());
          rows = lines.slice(1).map((line) => {
            const cols = line.split(",");
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => (obj[h] = cols[i] ? cols[i].trim() : ""));
            return obj;
          });
        }

        message.success(`${file.name} parsed  ${rows.length} rows`);
        (async () => {
          setUploading(true);
          try {
            const res = await fetch("/api/datasets/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(rows),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Upload check failed");
            // server now inserts new rows after creating embeddings; it returns inserted count and duplicate rows and inserted_refs
            setUploadResult({
              inserted: json.inserted || 0,
              duplicates: json.duplicates || [],
            });
            setModalData(json.duplicates || []);
            setTotalUploaded(
              (json.inserted || 0) + (json.duplicates?.length || 0)
            );
            message.info(
              `Server processed upload      inserted ${
                json.inserted || 0
              }, duplicates ${json.duplicates?.length || 0}`
            );
            // if any of the inserted refs match the current search, refresh the left list so user can see them
            const insertedRefs: string[] = json.inserted_refs || [];
            if (
              search &&
              insertedRefs.some((r) =>
                r.toLowerCase().includes(search.toLowerCase())
              )
            ) {
              await loadRecords();
            }
          } catch (e: unknown) {
            const em = e instanceof Error ? e.message : String(e);
            message.error("Server check failed: " + em);
          } finally {
            setUploading(false);
          }
        })();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error("Failed to parse file: " + msg);
      }
    };
    reader.readAsText(file);
    return false;
  };

  const openModal = (items: any[]) => {
    setModalData(items);
    setModalVisible(true);
  };

  const startEdit = (item: any) => {
    // If the duplicates modal is open, close it first so the drawer appears on top
    const openEditor = () => {
      setEditing(item);
      form.setFieldsValue({
        product_ref: item.product_ref,
        title: item.title,
        description: item.description,
        price: item.price,
        url: item.url,
        image_url: item.image_url,
        technical_data: item.technical_data,
      });
      setDrawerVisible(true);
    };

    if (modalVisible) {
      setEditingFromModal(true);
      setModalVisible(false);
      // allow modal to close animation to finish before opening drawer
      setTimeout(openEditor, 200);
    } else {
      setEditingFromModal(false);
      openEditor();
    }
  };

  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      const payload = [{ ...editing, ...values }];
      const res = await fetch("/api/records/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Save failed");
      message.success("Saved");
      // close drawer
      setDrawerVisible(false);

      // update duplicates modal data if the edited item is present there
      try {
        const updated =
          Array.isArray(j.records) && j.records.length > 0
            ? j.records[0]
            : null;
        if (updated) {
          setModalData((prev) =>
            prev.map((m) =>
              m.product_ref === updated.product_ref ? { ...m, ...updated } : m
            )
          );
          // highlight the edited row in the modal/table
          setHighlightedRef(updated.product_ref);
          setTimeout(() => setHighlightedRef(null), 3000);
        }
      } catch (e) {
        // ignore
      }

      // if editing came from the duplicates modal, reopen it
      if (editingFromModal) {
        setModalVisible(true);
        setEditingFromModal(false);
      }
      setEditing(null);
      await loadRecords();
    } catch (e: unknown) {
      const em = e instanceof Error ? e.message : String(e);
      message.error("Save failed: " + em);
    }
  };

  return (
    <>
      <style>{`.vgx-highlight-row { background: #fff7e6 !important; }`}</style>
      <Card className={styles.chatCard} variant="borderless">
        <div className={styles.chatInner} style={{ padding: 12 }}>
          <Spin spinning={uploading} tip="Uploading & creating embeddings...">
            <div style={{ display: "flex", gap: 20 }}>
              <RecordsList records={records.filter((r) => {
                if (!search) return true;
                const s = search.toLowerCase();
                return (String(r.product_ref || "").toLowerCase().includes(s) || (r.title || "").toLowerCase().includes(s));
              })} loading={loadingRecords} search={search} onSearchChange={setSearch} onRefresh={loadRecords} onEdit={startEdit} />

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Datasets</h2>
                    <div style={{ color: "#666", fontSize: 13 }}>Upload JSON/CSV, embeddings will be created server-side.</div>
                  </div>

                  <UploadBox onUploadFile={handleUpload} uploading={uploading} />
                </div>

                <Divider />

                <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                  <div style={{ flex: 1, background: "#f6ffed", border: "1px solid #b7eb8f", padding: 12, borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{uploadResult ? uploadResult.inserted : 0}</div>
                    <div style={{ color: "#666" }}>Inserted</div>
                  </div>

                  <div style={{ flex: 1, background: "#fff1f0", border: "1px solid #ffa39e", padding: 12, borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{uploadResult ? uploadResult.duplicates.length : 0}</div>
                    <div style={{ color: "#666" }}>Duplicates</div>
                  </div>

                  <div style={{ flex: 1, background: "#e6f7ff", border: "1px solid #91d5ff", padding: 12, borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{totalUploaded ?? (uploadResult ? uploadResult.inserted + uploadResult.duplicates.length : 0)}</div>
                    <div style={{ color: "#666" }}>Total processed</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Space>
                    <Button onClick={() => openModal(uploadResult ? uploadResult.duplicates : [])} disabled={!uploadResult || uploadResult.duplicates.length === 0}>View duplicates</Button>
                    <Button onClick={() => { setUploadResult(null); setTotalUploaded(null); }}>Clear</Button>
                  </Space>
                </div>
              </div>
            </div>
          </Spin>
        </div>

        <DuplicatesModal open={modalVisible} items={modalData} highlightedRef={highlightedRef} onClose={() => setModalVisible(false)} onEdit={startEdit} />

        <EditDrawer open={drawerVisible} record={editing} onClose={() => {
          setDrawerVisible(false);
          setEditing(null);
          form.resetFields();
          if (editingFromModal) {
            setModalVisible(true);
            setEditingFromModal(false);
          }
        }} onSave={async (vals) => {
          try {
            const payload = [{ ...editing, ...vals }];
            const res = await fetch("/api/records/upsert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const j = await res.json();
            if (!res.ok) throw new Error(j?.error || "Save failed");
            message.success("Saved");
            // update duplicates modal data if the edited item is present there
            try {
              const updated = Array.isArray(j.records) && j.records.length > 0 ? j.records[0] : null;
              if (updated) {
                setModalData((prev) => prev.map((m) => (m.product_ref === updated.product_ref ? { ...m, ...updated } : m)));
                setHighlightedRef(updated.product_ref);
                setTimeout(() => setHighlightedRef(null), 3000);
              }
            } catch (e) {
              // ignore
            }
            if (editingFromModal) {
              setModalVisible(true);
              setEditingFromModal(false);
            }
            setEditing(null);
            await loadRecords();
          } catch (e: unknown) {
            const em = e instanceof Error ? e.message : String(e);
            message.error("Save failed: " + em);
            throw e;
          }
        }} />
      </Card>
    </>
  );
};

export default Datasets;
