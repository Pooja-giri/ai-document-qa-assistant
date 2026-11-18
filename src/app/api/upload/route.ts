import { NextResponse } from "next/server";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { savePdfToSupabase, deletePdfFromSupabase } from "@/lib/supabase/storage";
import { supabaseAdmin } from "@/lib/supabase/server";

const workerPath = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);

const workerSrc = pathToFileURL(workerPath).href;

GlobalWorkerOptions.workerSrc = workerSrc;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_TEXT_CHARS = 100_000;

export async function POST(request: Request) {
  const savedDocuments: { id: string; storage_path: string }[] = [];

  try {
    const formData = await request.formData();

    const files = formData.getAll("files");

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one PDF file." },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `You can upload a maximum of ${MAX_FILES} PDFs at a time.` },
        { status: 400 },
      );
    }

    // Optional user authentication token check from request headers or cookie
    const authHeader = request.headers.get("authorization");
    let authenticatedUserId: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data: authData } = await supabaseAdmin.auth.getUser(token);
      if (authData?.user) {
        authenticatedUserId = authData.user.id;
      }
    }

    const documents: {
      fileName: string;
      totalPages: number;
      text: string;
      pages: { page: number; text: string }[];
    }[] = [];

    let combinedLength = 0;

    // Step 1: Pre-validation & PDF structure check across all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: `File #${i + 1} is invalid or corrupted.` },
          { status: 400 },
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { error: `"${file.name}" is empty (0 bytes). Please select a valid PDF.` },
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `"${file.name}" exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
          },
          { status: 400 },
        );
      }

      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith(".pdf") && file.type !== "application/pdf") {
        return NextResponse.json(
          { error: `"${file.name}" is not a PDF file. Only .pdf files are accepted.` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        return NextResponse.json(
          { error: `"${file.name}" is corrupted or not a standard PDF file header.` },
          { status: 400 },
        );
      }

      let pdf;
      try {
        const loadingTask = getDocument({
          data: new Uint8Array(buffer),
          useSystemFonts: true,
        });
        pdf = await loadingTask.promise;
      } catch (pdfErr) {
        console.error(`Failed to parse PDF ${file.name}:`, pdfErr);
        return NextResponse.json(
          {
            error: `"${file.name}" could not be parsed. The file may be password protected or corrupted.`,
          },
          { status: 422 },
        );
      }

      const pages: { page: number; text: string }[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        try {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();

          const pageText = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .trim();

          pages.push({
            page: pageNumber,
            text: pageText,
          });
        } catch (pageErr) {
          console.warn(`Error reading page ${pageNumber} of ${file.name}:`, pageErr);
          pages.push({
            page: pageNumber,
            text: "",
          });
        }
      }

      const text = pages
        .map((page) => page.text)
        .filter(Boolean)
        .join("\n\n");

      if (!text.trim()) {
        return NextResponse.json(
          {
            error: `No readable text found in "${file.name}". It may be a scanned document requiring OCR or image-only.`,
          },
          { status: 422 },
        );
      }

      combinedLength += text.length;

      if (combinedLength > MAX_TOTAL_TEXT_CHARS) {
        return NextResponse.json(
          {
            error:
              "The combined extracted text exceeds 100,000 characters. Please upload fewer or smaller documents.",
          },
          { status: 413 },
        );
      }

      documents.push({
        fileName: file.name,
        totalPages: pdf.numPages,
        text,
        pages,
      });
    }

    // Step 2: Atomic-style Save: If any file fails to save to Supabase, clean up all previously saved files!
    for (let index = 0; index < documents.length; index++) {
      const document = documents[index];
      const file = files[index] as File;

      try {
        const savedDocument = await savePdfToSupabase(
          file,
          document.totalPages,
          document.text,
          document.pages,
          authenticatedUserId,
        );

        savedDocuments.push({
          id: savedDocument.id,
          storage_path: savedDocument.storage_path,
        });
      } catch (saveError) {
        console.error(`Error saving document ${file.name}:`, saveError);

        // Rollback all already-saved documents for atomic multi-upload reliability!
        for (const doc of savedDocuments) {
          try {
            await deletePdfFromSupabase(doc.storage_path, doc.id);
          } catch (rollbackErr) {
            console.error("Rollback failed for", doc.id, rollbackErr);
          }
        }

        throw new Error(
          `Failed while saving "${file.name}" to storage. All newly uploaded files in this batch were rolled back to keep data consistent.`,
        );
      }
    }

    // Step 3: Combine extracted text while preserving page numbers and source document headings.
    const combinedText = documents
      .map((document) => {
        const pageContent = document.pages
          .map(
            (page) =>
              `PAGE ${page.page}:\n${page.text || "[No readable text on this page]"}`,
          )
          .join("\n\n");

        return `DOCUMENT: ${document.fileName}\n\n${pageContent}`;
      })
      .join("\n\n========================================\n\n");

    const totalPages = documents.reduce(
      (total, document) => total + document.totalPages,
      0,
    );

    // Step 4: Include Supabase IDs in the response
    const documentsWithStorage = documents.map((document, index) => ({
      ...document,
      documentId: savedDocuments[index].id,
      storagePath: savedDocuments[index].storage_path,
    }));

    return NextResponse.json({
      message: "PDFs extracted and saved successfully.",
      totalFiles: documents.length,
      totalPages,
      documents: documentsWithStorage,
      text: combinedText,
    });
  } catch (error) {
    console.error("PDF upload and processing error:", error);

    const details = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: details || "Unable to process and save the selected PDFs.",
      },
      { status: 500 },
    );
  }
}
