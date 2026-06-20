"use client";

// ---------------------------------------------------------------------------
// Giriş formu — Credentials ile Auth.js signIn
// Başarıda callbackUrl'e (varsayılan /dashboard) yönlendirir.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Şifre gerekli"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    setFormError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    setSubmitting(false);

    if (result?.error) {
      setFormError("E-posta veya şifre hatalı.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Paper withBorder shadow="md" p="xl" radius="md" w="100%" maw={420}>
      <Stack gap="md">
        <div>
          <Title order={2}>Dengizek</Title>
          <Text c="dimmed" size="sm">
            Otel paneli ve yönetim için giriş yapın.
          </Text>
        </div>

        {formError && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={16} />}
            title="Giriş başarısız"
          >
            {formError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack gap="sm">
            <TextInput
              label="E-posta"
              placeholder="ornek@otel.com"
              type="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <PasswordInput
              label="Şifre"
              placeholder="Şifreniz"
              error={errors.password?.message}
              {...register("password")}
            />
            <Button type="submit" loading={submitting} fullWidth mt="xs">
              Giriş yap
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}
