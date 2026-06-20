import { z } from "zod";

// ---------------------------------------------------------------------------
// Kimlik / kullanıcı yönetimi şemaları
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Şifre gerekli"),
});

export const createUserSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin").max(254),
  name: z.string().min(1, "Ad gerekli").max(200),
  role: z.enum(["admin", "manager"]).default("manager"),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .max(128, "Şifre en fazla 128 karakter olabilir"),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1, "Ad gerekli").max(200).optional(),
    role: z.enum(["admin", "manager"]).optional(),
    isActive: z.boolean().optional(),
    password: z
      .string()
      .min(8, "Şifre en az 8 karakter olmalı")
      .max(128)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Güncellenecek en az bir alan gönderin.",
  });

export type CreateUserValues = z.infer<typeof createUserSchema>;
export type UpdateUserValues = z.infer<typeof updateUserSchema>;
