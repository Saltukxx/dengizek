"use client";

// ---------------------------------------------------------------------------
// Şifremi unuttum formu — e-posta girilir, sonuç her zaman aynı mesajı gösterir
// (kullanıcı numaralandırmasını önlemek için)
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Anchor, Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/schemas/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 429) {
        setFormError("Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
        return;
      }
      setSent(true);
    } catch {
      setFormError("Bir şeyler ters gitti, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper withBorder shadow="md" p="xl" radius="md" w="100%" maw={420}>
      <Stack gap="md">
        <div>
          <Title order={2}>Şifremi unuttum</Title>
          <Text c="dimmed" size="sm">
            Hesabınıza kayıtlı e-postayı girin, sıfırlama bağlantısı gönderelim.
          </Text>
        </div>

        {sent ? (
          <Alert color="green" icon={<IconCheck size={16} />} title="E-posta gönderildi">
            Bu e-posta bize kayıtlıysa, birazdan sıfırlama bağlantısı içeren bir e-posta
            alacaksınız. Gelmezse spam klasörünü kontrol edin.
          </Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack gap="sm">
              {formError && (
                <Alert color="red" title="Hata">
                  {formError}
                </Alert>
              )}
              <TextInput
                label="E-posta"
                placeholder="ornek@otel.com"
                type="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <Button type="submit" loading={submitting} fullWidth mt="xs">
                Sıfırlama bağlantısı gönder
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
