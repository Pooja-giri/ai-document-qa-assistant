import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./server";

type PdfPage = {
  page: number;
  text: string;
};

export async function savePdfToSupabase(
  file: File,
  totalPages: number,
  extractedText: string,
  pages: PdfPage[],
  userId?: string | null,
) {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const storagePath = `${randomUUID()}/${safeFileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("PDF storage upload failed:", uploadError.message);

    throw new Error(`Unable to upload ${file.name} to storage: ${uploadError.message}`);
  }

  const insertPayload: Record<string, unknown> = {
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    total_pages: totalPages,
    extracted_text: extractedText,
    pages: pages,
  };

  if (userId) {
    insertPayload.user_id = userId;
  }

  const { data, error: databaseError } = await supabaseAdmin
    .from("documents")
    .insert(insertPayload)
    .select()
    .single();

  if (databaseError) {
    console.error("Document metadata save failed:", databaseError.message);

    const { error: cleanupError } = await supabaseAdmin.storage
      .from("documents")
      .remove([storagePath]);

    if (cleanupError) {
      console.error("Storage cleanup failed:", cleanupError.message);
    }

    throw new Error(`Unable to save document information: ${databaseError.message}`);
  }

  return data;
}

export async function deletePdfFromSupabase(storagePath: string, documentId: string) {
  const { error: storageError } = await supabaseAdmin.storage
    .from("documents")
    .remove([storagePath]);

  if (storageError) {
    console.error("Storage deletion failed:", storageError.message);
  }

  const { error: dbError } = await supabaseAdmin
    .from("documents")
    .delete()
    .eq("id", documentId);

  return { storageError, dbError };
}
