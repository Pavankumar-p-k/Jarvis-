import { z } from "zod";

export const commandSchema = z.string().trim().min(1).max(300);

export const pluginManifestSchema = z.object({
  id: z.string().min(2).max(64),
  name: z.string().min(2).max(80),
  version: z.string().min(1).max(20),
  description: z.string().min(1).max(300),
  entryCommand: z.string().min(1).max(120),
  entry: z.string().min(1).max(180).optional(),
  permissionLevel: z.enum(["safe", "confirm", "admin"])
});

export const customCommandCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  trigger: z.string().trim().min(2).max(120),
  action: z.string().trim().min(1).max(220),
  passThroughArgs: z.boolean().optional()
});

export const customCommandUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    trigger: z.string().trim().min(2).max(120).optional(),
    action: z.string().trim().min(1).max(220).optional(),
    passThroughArgs: z.boolean().optional(),
    enabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const voiceAudioSchema = z.object({
  base64Audio: z.string().min(8).max(8_000_000),
  mimeType: z.string().trim().min(3).max(80).optional()
});

export const voiceEnabledSchema = z.boolean();

export const voiceTranscriptSchema = z.string().trim().min(1).max(300);
