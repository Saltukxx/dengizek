"use client";

// ---------------------------------------------------------------------------
// Şifre sıfırlama formu — token URL'den gelir, yeni şifre belirlenir
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";

const formSchema = z.object({
  password: z.string().min(8, "Şifre en az 8 karakter olmalı").max(128),
});
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setFormError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: values.password }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.ok) {
      setDone(true);
      setTimeout(() => router.push("/giris"), 2500);
    } else {
      setFormError(json.error ?? "Bir şeyler ters gitti.");
    }
  }

  return (
    <Paper withBorder shadow="md" p="xl" radius="md" w="100%" maw={420}>
      <Stack gap="md">
        <div>
          <Title order={2}>Yeni şifre belirle</Title>
          <Text c="dimmed" size="sm">
            Hesabınız için yeni bir şifre girin.
          </Text>
        </div>

        {done ? (
          <Alert color="green" icon={<IconCheck size={16} />} title="Şifre güncellendi">
            Girişe yönlendiriliyorsunuz…
          </Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack gap="sm">
              {formError && (
                <Alert color="red" icon={<IconAlertCircle size={16} />} title="Hata">
                  {formError}
                </Alert>
              )}
              <PasswordInput
                label="Yeni şifre"
                placeholder="En az 8 karakter"
                error={errors.password?.message}
                {...register("password")}
              />
              <Button type="submit" loading={submitting} fullWidth mt="xs">
                Şifreyi güncelle
              </Button>
            </Stack>
          </form>
        )}

        <Anchor component={Link} href="/giris" size="sm" ta="center">
          Girişe dön
        </Anchor>
      </Stack>
    </Paper>
  );
}
