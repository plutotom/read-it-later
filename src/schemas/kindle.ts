import { z } from "zod";

export const kindleSettingsSchema = z.object({
  senderToken: z.string().min(1),
  kindleEmail: z.string().email().nullable(),
  connectedAt: z.string().datetime().nullable(),
});

export type KindleSettings = z.infer<typeof kindleSettingsSchema>;

export const kindleDeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
]);

export type KindleDeliveryStatus = z.infer<typeof kindleDeliveryStatusSchema>;
