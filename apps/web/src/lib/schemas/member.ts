import { z } from "zod";

// ---------------------------------------------------------------------------
// Otel üyeliği şemaları — admin kullanıcıyı otele atar/çıkarır
// ---------------------------------------------------------------------------

export const assignMemberSchema = z.object({
  hotelId: z.string().uuid("Geçerli bir tesis kimliği gerekli"),
  role: z.enum(["owner", "editor"]).default("editor"),
});

export const removeMemberSchema = z.object({
  hotelId: z.string().uuid("Geçerli bir tesis kimliği gerekli"),
});

export type AssignMemberValues = z.infer<typeof assignMemberSchema>;
