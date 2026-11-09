"use client";

import { useState } from "react";
import { Badge, Button, Group, Stack, Text, Textarea } from "@mantine/core";

export interface UnansweredQuestionItem {
  question: string;
  count: number;
  reason: "bilgi-yok" | "kartsiz";
  lastAskedAt: string;
  answer?: { status: "taslak" | "yayinda"; text: string };
}

const MAX_CHARS = 240;

/**
 * Rehberin cevaplayamadığı tek soru: otelci cevabı buradan ekler. Cevap
 * taslaktaki otel ifadelerine yazılır; rehber yayından sonra kullanır.
 */
export function UnansweredQuestionRow({
  hotelId,
  item,
  onSaved,
}: {
  hotelId: string;
  item: UnansweredQuestionItem;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.answer?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/manager/hotels/${hotelId}/ai-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: item.question, answer: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Cevap kaydedilemedi.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Cevap kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
            {item.question}
          </Text>
          {item.answer && !editing ? (
            <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
              Cevabınız: {item.answer.text}
            </Text>
          ) : null}
        </div>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {item.answer ? (
            <Badge variant="light" color={item.answer.status === "yayinda" ? "green" : "yellow"}>
              {item.answer.status === "yayinda" ? "Cevap yayında" : "Yayın bekliyor"}
            </Badge>
          ) : (
            <Badge variant="light" color={item.reason === "bilgi-yok" ? "red" : "gray"}>
              {item.reason === "bilgi-yok" ? "Bilgi yok" : "Kartsız cevap"}
            </Badge>
          )}
          <Badge variant="outline">{item.count}×</Badge>
          {!editing ? (
            <Button size="compact-xs" variant="subtle" onClick={() => setEditing(true)}>
              {item.answer ? "Düzenle" : "Cevap ekle"}
            </Button>
          ) : null}
        </Group>
      </Group>
      {editing ? (
        <Stack gap={6}>
          <Textarea
            autosize
            minRows={2}
            maxLength={MAX_CHARS}
            placeholder="Misafire verilecek cevap (ör. Evet, hamamımızda ücretli kese hizmeti var.)"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            error={error}
            description={`${text.length}/${MAX_CHARS} · Telefon, e-posta ya da web adresi yazmayın.`}
          />
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setEditing(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button size="xs" onClick={save} loading={saving} disabled={text.trim().length < 2}>
              Kaydet
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Stack>
  );
}
