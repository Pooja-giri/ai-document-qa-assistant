"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AuthUser = {
  id: string;
  email?: string;
};

type ChatSession = {
  id: string;
  title: string;
  document_ids?: string[];
  updated_at?: string;
  created_at?: string;
};

type UploadedDocument = {
  id: string;
  documentId?: string;
  fileName: string;
  totalPages: number;
  text: string;
  pages: {
    page: number;
    text: string;
  }[];
  file?: File;
  fileSize?: number;
  createdAt?: string;
};

function formatAnswer(content: string) {
  const citationRegex = /\[Source:\s*(.+?),\s*Page:\s*(\d+)\]/gi;

  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = citationRegex.exec(content)) !== null) {
    // Preserve the answer text before the citation.
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const fileName = match[1].trim();
    const pageNumber = match[2];

    parts.push(
      <span
        key={key++}
        className="my-2 inline-flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800"
      >
        <span className="inline-flex items-center gap-1">
          <span>📄</span>
          {fileName}
        </span>

        <span className="rounded-md bg-indigo-100 px-2 py-1">
          Page {pageNumber}
        </span>
      </span>,
    );

    lastIndex = citationRegex.lastIndex;
  }

  // Preserve any remaining answer text.
  if (lastIndex < content.length) {
    parts.push(
      <span key={key++} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>,
    );
  }

  return parts.length > 0 ? parts : content;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);

  const [documentSearch, setDocumentSearch] = useState("");
  const [documentSort, setDocumentSort] = useState<
    "newest" | "oldest" | "name"
  >("newest");

  const [previewDocument, setPreviewDocument] =
    useState<UploadedDocument | null>(null);
  const [detailsDocument, setDetailsDocument] =
    useState<UploadedDocument | null>(null);
  const [selectedSavedDocumentIds, setSelectedSavedDocumentIds] = useState<
    string[]
  >([]);
  const [isLoadingSavedDocuments, setIsLoadingSavedDocuments] = useState(true);
  const [isUpdatingSavedDocuments, setIsUpdatingSavedDocuments] =
    useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [newDocumentText, setNewDocumentText] = useState("");
  const [savedDocumentsText, setSavedDocumentsText] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [keyPoints, setKeyPoints] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [importantDetails, setImportantDetails] = useState("");
  const [isExtractingDetails, setIsExtractingDetails] = useState(false);
  const isAIProcessing =
    isAsking || isSummarizing || isExtracting || isExtractingDetails;
  const [isUploading, setIsUploading] = useState(false);
  const uploadLockRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Authentication state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Persistent Chat History state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // Themes state: 'indigo' (default), 'dark', 'emerald', 'sunset', 'cyber'
  const [theme, setTheme] = useState<
    "indigo" | "dark" | "emerald" | "sunset" | "cyber"
  >("indigo");

  useEffect(() => {
    const savedTheme = localStorage.getItem("doc_qa_theme") as typeof theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const changeTheme = (newTheme: typeof theme) => {
    setTheme(newTheme);
    localStorage.setItem("doc_qa_theme", newTheme);
  };

  useEffect(() => {
    const combinedContext = [newDocumentText.trim(), savedDocumentsText.trim()]
      .filter(Boolean)
      .join("\n\n========================================\n\n");

    setExtractedText(combinedContext);
  }, [newDocumentText, savedDocumentsText]);

  useEffect(() => {
    if (!previewDocument) {
      setPreviewUrl("");
      return;
    }

    // Preview a newly uploaded PDF from the browser File object.
    if (previewDocument.file) {
      const url = URL.createObjectURL(previewDocument.file);

      setPreviewUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }

    // Preview a previously saved PDF using a Supabase signed URL.
    let cancelled = false;
    const documentId = previewDocument.documentId || previewDocument.id;

    async function fetchPreviewUrl() {
      try {
        setPreviewUrl("");

        const response = await fetch(`/api/documents/${documentId}/url`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load PDF preview.");
        }

        if (!cancelled) {
          setPreviewUrl(data.signedUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load PDF preview.",
          );
        }
      }
    }

    fetchPreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [previewDocument]);

  useEffect(() => {
    async function fetchSavedDocuments() {
      try {
        const response = await fetch("/api/documents");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load saved documents.");
        }

        const savedDocuments: UploadedDocument[] = data.documents.map(
          (document: {
            id: string;
            file_name: string;
            file_size: number;
            total_pages: number;
            created_at: string;
          }) => ({
            id: document.id,
            documentId: document.id,
            fileName: document.file_name,
            fileSize: document.file_size,
            totalPages: document.total_pages,
            createdAt: document.created_at,
            text: "",
            pages: [],
          }),
        );

        setUploadedDocuments(savedDocuments);
      } catch (error) {
        console.error("Saved documents loading error:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load saved documents.",
        );
      } finally {
        setIsLoadingSavedDocuments(false);
      }
    }

    fetchSavedDocuments();
  }, [currentUser]);

  // Load auth status and chat sessions
  useEffect(() => {
    async function initAuthAndHistory() {
      try {
        const authRes = await fetch("/api/auth");
        const authData = await authRes.json();
        if (authData.authenticated && authData.user) {
          setCurrentUser(authData.user);
        }
      } catch (err) {
        console.warn("Could not check auth status:", err);
      } finally {
        setIsAuthChecking(false);
      }

      try {
        const chatRes = await fetch("/api/chat");
        const chatData = await chatRes.json();
        if (chatData.sessions) {
          setChatSessions(chatData.sessions);
        }
      } catch (err) {
        console.warn("Could not load chat sessions:", err);
      }
    }

    initAuthAndHistory();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length > 5) {
      setError("You can upload a maximum of 5 PDFs at a time.");
      setSelectedFiles([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (files.length === 0) return;

    const invalidFile = files.find(
      (selectedFile) =>
        selectedFile.type !== "application/pdf" &&
        !selectedFile.name.toLowerCase().endsWith(".pdf"),
    );

    if (invalidFile) {
      setError(
        `"${invalidFile.name}" is not a valid PDF file. Only PDF documents are supported.`,
      );
      setSelectedFiles([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const emptyFile = files.find((selectedFile) => selectedFile.size === 0);
    if (emptyFile) {
      setError(
        `"${emptyFile.name}" is empty (0 bytes). Please select a valid PDF.`,
      );
      setSelectedFiles([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const oversizedFile = files.find(
      (selectedFile) => selectedFile.size > 10 * 1024 * 1024,
    );

    if (oversizedFile) {
      setError(
        `"${oversizedFile.name}" exceeds the 10 MB file size limit (${(oversizedFile.size / (1024 * 1024)).toFixed(2)} MB).`,
      );
      setSelectedFiles([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFiles(files);
    setPreviewDocument(null);
    setPreviewPage(1);

    // Keep the first file available for the existing UI.
    setFile(files[0]);

    setError("");
    setUploadStatus("");
  };

  async function handleUpload() {
    if (isAIProcessing || isUploading || uploadLockRef.current) {
      return;
    }
    uploadLockRef.current = true;

    if (selectedFiles.length === 0) {
      setError("Please select at least one PDF.");
      return;
    }

    const formData = new FormData();

    selectedFiles.forEach((selectedFile) => {
      formData.append("files", selectedFile);
    });

    setError("");
    setUploadStatus("");
    setIsUploading(true);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload PDFs.");
      }

      // Clear previous results only after successful upload.
      setMessages([]);
      setSummary("");
      setKeyPoints("");
      setImportantDetails("");
      setPreviewDocument(null);
      setPreviewPage(1);

      const processedDocuments: UploadedDocument[] = data.documents.map(
        (document: Omit<UploadedDocument, "id" | "file">, index: number) => ({
          ...document,
          id: document.documentId,
          documentId: document.documentId,
          file: selectedFiles[index],
        }),
      );

      setUploadedDocuments((previousDocuments) => {
        const newDocumentIds = new Set(
          processedDocuments.map((document) => document.id),
        );

        return [
          ...processedDocuments,
          ...previousDocuments.filter(
            (document) => !newDocumentIds.has(document.id),
          ),
        ];
      });

      setNewDocumentText(data.text);

      setUploadStatus(
        `Successfully processed ${data.totalFiles} PDF(s) and ${data.totalPages} page(s).`,
      );

      // Step 18.31: Clear selected files and reset file input after successful upload
      setSelectedFiles([]);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while uploading PDFs.",
      );
    } finally {
      uploadLockRef.current = false;
      setIsUploading(false);
    }
  }

  function handleNewChat() {
    if (isAIProcessing) return;

    setMessages([]);
    setQuestion("");
    setError("");
    setCurrentSessionId(null);
  }

  async function handleLoadChatSession(session: ChatSession) {
    if (isAIProcessing) return;

    try {
      setIsHistoryDrawerOpen(false);
      setCurrentSessionId(session.id);
      setError("");

      const res = await fetch(`/api/chat?sessionId=${session.id}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(
          data.messages.map(
            (m: { role: "user" | "assistant"; content: string }) => ({
              role: m.role,
              content: m.content,
            }),
          ),
        );
      }
    } catch (err) {
      console.error("Failed to load chat session:", err);
      setError("Unable to load the requested conversation.");
    }
  }

  async function handleDeleteChatSession(
    sessionId: string,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat?sessionId=${sessionId}`, { method: "DELETE" });
      setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setIsAuthLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email: authEmail,
          password: authPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      if (data.user) {
        setCurrentUser(data.user);
      }
      setIsAuthModalOpen(false);
      setAuthPassword("");
      setAuthEmail("");

      // Refresh chat sessions for the newly authenticated user
      const chatRes = await fetch("/api/chat");
      const chatData = await chatRes.json();
      if (chatData.sessions) {
        setChatSessions(chatData.sessions);
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Authentication error.",
      );
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setCurrentUser(null);
      handleNewChat();
      setChatSessions([]);
    } catch (err) {
      console.error("Logout error:", err);
    }
  }

  async function handleSummarize() {
    if (!extractedText) {
      setError("Please upload a PDF first.");
      return;
    }

    if (isAIProcessing) return;

    setError("");
    setSummary("");
    setIsSummarizing(true);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentText: extractedText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate summary.");
      }

      setSummary(data.summary);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while generating the summary.",
      );
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleExtractKeyPoints() {
    if (!extractedText) {
      setError("Please upload a PDF first.");
      return;
    }

    if (isAIProcessing) return;

    setError("");
    setKeyPoints("");
    setIsExtracting(true);

    try {
      const response = await fetch("/api/extract-key-points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentText: extractedText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract key points.");
      }

      setKeyPoints(data.result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while extracting key points.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleExtractDetails() {
    if (!extractedText) {
      setError("Please upload a PDF first.");
      return;
    }

    if (isAIProcessing) {
      return;
    }

    setError("");
    setImportantDetails("");
    setIsExtractingDetails(true);

    try {
      const response = await fetch("/api/extract-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentText: extractedText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract important details.");
      }

      setImportantDetails(data.result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while extracting details.",
      );
    } finally {
      setIsExtractingDetails(false);
    }
  }

  function handleClearDocument() {
    if (isAIProcessing) return;

    if (isAsking || isSummarizing || isExtracting || isExtractingDetails) {
      return;
    }

    setFile(null);
    setSelectedFiles([]);
    setUploadedDocuments([]);

    setNewDocumentText("");
    setSavedDocumentsText("");
    setSelectedSavedDocumentIds([]);

    setUploadStatus("");

    setMessages([]);
    setQuestion("");
    setError("");

    setSummary("");
    setKeyPoints("");
    setImportantDetails("");

    setPreviewDocument(null);
    setPreviewPage(1);
  }

  function handleOpenPreview(document: UploadedDocument) {
    setPreviewPage(1);
    setPreviewDocument(document);
  }

  const handleLoadSavedDocument = async (document: UploadedDocument) => {
    await handleToggleSavedDocument(document, true);
  };

  const handleDeleteSavedDocument = async (documentId: string) => {
    if (isUpdatingSavedDocuments || isAIProcessing) return;

    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this document?",
    );

    if (!confirmed) return;

    try {
      setError("");

      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete document.");
      }

      const wasSelected = selectedSavedDocumentIds.includes(documentId);

      const remainingSelectedIds = selectedSavedDocumentIds.filter(
        (id) => id !== documentId,
      );

      const remainingDocuments = uploadedDocuments.filter(
        (document) =>
          document.id !== documentId &&
          remainingSelectedIds.includes(document.id),
      );

      // Remove the deleted document from the library.
      setUploadedDocuments((previousDocuments) =>
        previousDocuments.filter((document) => document.id !== documentId),
      );

      // Remove it from the selected documents list.
      setSelectedSavedDocumentIds(remainingSelectedIds);

      // Rebuild context using the remaining selected documents.
      if (wasSelected) {
        const combinedText = remainingDocuments
          .map((document) => {
            const pageContent = document.pages
              .map(
                (page) =>
                  `PAGE ${page.page}:\n${page.text || "[No readable text]"}`,
              )
              .join("\n\n");

            return `DOCUMENT: ${document.fileName}\n\n${
              pageContent || document.text
            }`;
          })
          .join("\n\n========================================\n\n");

        setSavedDocumentsText(combinedText);

        // Clear previous conversation because its context changed.
        setMessages([]);
        setSummary("");
        setKeyPoints("");
        setImportantDetails("");
      }

      // Close panels if they refer to the deleted document.
      setDetailsDocument((current) =>
        current?.id === documentId ? null : current,
      );

      setPreviewDocument((current) =>
        current?.id === documentId ? null : current,
      );

      alert("Document deleted successfully.");
    } catch (error) {
      console.error("Document deletion error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Something went wrong while deleting the document.",
      );
    }
  };

  const handleToggleSavedDocument = async (
    document: UploadedDocument,
    isSelected: boolean,
  ) => {
    if (isUpdatingSavedDocuments || isAIProcessing) return;

    setIsUpdatingSavedDocuments(true);

    try {
      setError("");

      let loadedDocument = document;

      // Retrieve document content if it isn't already loaded.
      if (!document.text) {
        const documentId = document.documentId || document.id;

        const response = await fetch(`/api/documents/${documentId}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load document content.");
        }

        loadedDocument = {
          ...document,
          text: data.document.text,
          pages: data.document.pages,
          totalPages: data.document.totalPages,
        };

        setUploadedDocuments((previousDocuments) =>
          previousDocuments.map((item) =>
            item.id === document.id ? loadedDocument : item,
          ),
        );
      }

      const nextIds = isSelected
        ? [...new Set([...selectedSavedDocumentIds, document.id])]
        : selectedSavedDocumentIds.filter((id) => id !== document.id);

      setSelectedSavedDocumentIds(nextIds);

      // Build context from all selected documents.
      const documentsForContext = uploadedDocuments
        .map((item) => (item.id === document.id ? loadedDocument : item))
        .filter((item) => nextIds.includes(item.id));

      const combinedContext = documentsForContext
        .map((item) => {
          const pageContent = item.pages
            .map(
              (page) =>
                `PAGE ${page.page}:\n${page.text || "[No readable text]"}`,
            )
            .join("\n\n");

          return `DOCUMENT: ${item.fileName}\n\n${pageContent || item.text}`;
        })
        .join("\n\n========================================\n\n");

      setSavedDocumentsText(combinedContext);
      setMessages([]);
    } catch (error) {
      console.error("Multi-document loading error:", error);

      setError(
        error instanceof Error ? error.message : "Unable to select document.",
      );
    } finally {
      setIsUpdatingSavedDocuments(false);
    }
  };

  function handleClosePreview() {
    setPreviewDocument(null);
    setPreviewPage(1);
  }

  function handlePreviousPage() {
    setPreviewPage((previous) => Math.max(1, previous - 1));
  }

  function handleNextPage() {
    setPreviewPage((previous) =>
      Math.min(previewDocument?.totalPages ?? 1, previous + 1),
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const userQuestion = question.trim();

    if (isAIProcessing) return;

    if (!userQuestion) {
      setError("Please enter a question.");
      return;
    }

    if (!extractedText) {
      setError("Please upload a PDF first.");
      return;
    }

    // Preserve the complete conversation before adding the new question.
    const previousMessages = messages;

    // Send only the most recent 10 messages as conversation history.
    const conversationHistory = previousMessages.slice(-10);

    // Add the user's question to the chat.
    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);

    setQuestion("");
    setError("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentText: extractedText,
          question: userQuestion,
          history: conversationHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to get an answer. Please try again.",
        );
      }

      if (!data.answer || typeof data.answer !== "string") {
        throw new Error(
          "The AI returned an empty or invalid answer. Please try again.",
        );
      }

      // Add the AI response to the conversation.
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);

      // Automatically persist to chat history if available
      (async () => {
        try {
          let sessionId = currentSessionId;
          if (!sessionId) {
            const createRes = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "create_session",
                title:
                  userQuestion.slice(0, 45) +
                  (userQuestion.length > 45 ? "..." : ""),
                documentIds: selectedSavedDocumentIds,
              }),
            });
            const sessionData = await createRes.json();
            if (sessionData.session?.id) {
              sessionId = sessionData.session.id;
              setCurrentSessionId(sessionId);
              setChatSessions((prev) => [sessionData.session, ...prev]);
            }
          }

          if (sessionId) {
            // Save user message and assistant reply
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "save_message",
                sessionId,
                role: "user",
                content: userQuestion,
              }),
            });

            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "save_message",
                sessionId,
                role: "assistant",
                content: data.answer,
              }),
            });
          }
        } catch (chatSaveErr) {
          console.warn("Could not persist conversation history:", chatSaveErr);
        }
      })();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";

      // Remove the failed question from the conversation.
      setMessages(previousMessages);

      // Restore the question so it can be submitted again.
      setQuestion(userQuestion);

      setError(message);
    } finally {
      setIsAsking(false);
    }
  };

  const filteredDocuments = uploadedDocuments
    .filter((document) =>
      document.fileName
        .toLowerCase()
        .includes(documentSearch.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (documentSort === "name") {
        return a.fileName.localeCompare(b.fileName);
      }

      const dateA = new Date(a.createdAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? 0).getTime();

      return documentSort === "newest" ? dateB - dateA : dateA - dateB;
    });

  // Dynamic theme style tokens
  const themeStyles = {
    indigo: {
      main: "bg-slate-50 text-slate-900",
      header: "border-slate-200/80 bg-white/90 backdrop-blur-md",
      card: "border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md",
      accent: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200",
      accentBorder:
        "border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100/70",
      badge: "bg-indigo-100 text-indigo-800",
      input:
        "bg-white border-slate-300 focus:border-indigo-500 focus:ring-indigo-100 text-slate-900 placeholder-slate-400",
      chatUser: "bg-indigo-600 text-white",
      chatAi: "bg-white border-slate-200 text-slate-800 shadow-xs",
      subtleText: "text-slate-500",
    },
    dark: {
      main: "bg-slate-950 text-slate-100",
      header: "border-slate-800/80 bg-slate-900/90 backdrop-blur-md",
      card: "border-slate-800/80 bg-slate-900/90 shadow-lg shadow-black/20 backdrop-blur-md",
      accent: "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-950",
      accentBorder:
        "border-indigo-900/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60",
      badge: "bg-indigo-950/80 text-indigo-300 border border-indigo-800/50",
      input:
        "bg-slate-900/90 border-slate-800 focus:border-indigo-500 focus:ring-indigo-950/50 text-white placeholder-slate-500",
      chatUser: "bg-indigo-600 text-white shadow-md shadow-indigo-900/30",
      chatAi: "bg-slate-900/90 border-slate-800 text-slate-200 shadow-xs",
      subtleText: "text-slate-400",
    },
    emerald: {
      main: "bg-emerald-50/40 text-emerald-950",
      header: "border-emerald-200/80 bg-white/90 backdrop-blur-md",
      card: "border-emerald-100 bg-white/90 shadow-sm backdrop-blur-md",
      accent:
        "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200",
      accentBorder:
        "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100/70",
      badge: "bg-emerald-100 text-emerald-800",
      input:
        "bg-white border-emerald-200 focus:border-emerald-500 focus:ring-emerald-100 text-emerald-950 placeholder-emerald-400",
      chatUser: "bg-emerald-600 text-white",
      chatAi: "bg-white border-emerald-100 text-emerald-900 shadow-xs",
      subtleText: "text-emerald-700/70",
    },
    sunset: {
      main: "bg-rose-50/30 text-slate-900",
      header: "border-rose-100 bg-white/90 backdrop-blur-md",
      card: "border-rose-100 bg-white/90 shadow-sm backdrop-blur-md",
      accent: "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200",
      accentBorder:
        "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100/70",
      badge: "bg-rose-100 text-rose-800",
      input:
        "bg-white border-rose-200 focus:border-rose-500 focus:ring-rose-100 text-slate-900 placeholder-rose-400",
      chatUser: "bg-gradient-to-r from-rose-600 to-orange-500 text-white",
      chatAi: "bg-white border-rose-100 text-slate-800 shadow-xs",
      subtleText: "text-slate-500",
    },
    cyber: {
      main: "bg-[#0b0f19] text-cyan-50",
      header: "border-cyan-900/50 bg-[#0f172a]/90 backdrop-blur-md",
      card: "border-cyan-900/40 bg-[#111827]/90 shadow-xl shadow-cyan-950/20 backdrop-blur-md",
      accent:
        "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-cyan-500/20",
      accentBorder:
        "border-cyan-800/60 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40",
      badge: "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60",
      input:
        "bg-[#0f172a] border-cyan-900/60 focus:border-cyan-400 focus:ring-cyan-950/50 text-cyan-100 placeholder-cyan-700",
      chatUser:
        "bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-medium",
      chatAi: "bg-[#1e293b]/90 border-cyan-900/40 text-cyan-100 shadow-sm",
      subtleText: "text-cyan-400/60",
    },
  }[theme];

  if (isAuthChecking) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${themeStyles.main} relative font-sans`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-xl font-bold text-white shadow-xl shadow-indigo-500/30 animate-pulse">
            <span>AI</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <svg
              className="h-4 w-4 animate-spin text-indigo-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Checking authentication...</span>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${themeStyles.main} relative overflow-hidden font-sans p-4 sm:p-6`}
      >
        {/* Background radial ambient lights */}
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(255,255,255,0))]" />

        <div className="relative z-10 w-full max-w-md">
          {/* Logo & Brand Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-2xl font-bold text-white shadow-xl shadow-indigo-500/30">
              <span className="tracking-tight">AI</span>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Document Q&A Assistant
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Multi-PDF Analysis · Deep Citations · Conversational AI
            </p>
          </div>

          {/* Login / Signup Card */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-2xl shadow-slate-200/50 dark:shadow-black/50 backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {authMode === "login" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {authMode === "login"
                  ? "Please log in to access your documents and workspace."
                  : "Sign up to start analyzing documents with AI."}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authError && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-xs font-medium text-red-600 dark:text-red-400">
                  {authError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Must be at least 6 characters
                </p>
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {isAuthLoading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Please wait...</span>
                  </>
                ) : authMode === "login" ? (
                  "Sign In & Enter App"
                ) : (
                  "Create Account & Enter App"
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {authMode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                    }}
                    className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                    className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
                  >
                    Log In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen transition-colors duration-300 ${themeStyles.main} relative overflow-hidden font-sans`}
    >
      {/* Background radial ambient lights */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />

      <header
        className={`sticky top-0 z-40 border-b transition-colors duration-300 ${themeStyles.header}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-lg font-bold text-white shadow-md shadow-indigo-500/20">
              <span className="tracking-tight">AI</span>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">
                  Document Q&A Assistant
                </h1>
              </div>
              <p className={`text-xs ${themeStyles.subtleText}`}>
                Multi-PDF Analysis · Deep Citations · Conversational AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Theme switcher palette */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-black/5 p-1 backdrop-blur-xs">
              {(
                [
                  { id: "indigo", label: "Default", color: "bg-indigo-600" },
                  {
                    id: "dark",
                    label: "Dark",
                    color: "bg-slate-900 border border-slate-600",
                  },
                  { id: "emerald", label: "Emerald", color: "bg-emerald-600" },
                  { id: "sunset", label: "Sunset", color: "bg-rose-500" },
                  { id: "cyber", label: "Cyber", color: "bg-cyan-400" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeTheme(t.id)}
                  title={`${t.label} theme`}
                  className={`h-6 w-6 rounded-lg transition-transform duration-150 ${t.color} ${
                    theme === t.id
                      ? "scale-115 ring-2 ring-indigo-500 shadow-sm"
                      : "opacity-60 hover:opacity-100 hover:scale-105"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition shadow-xs hover:shadow-sm ${themeStyles.accentBorder}`}
            >
              <span>💬</span>
              <span className="hidden sm:inline">History</span>
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {chatSessions.length}
              </span>
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2">
                <span
                  className={`hidden sm:inline-block rounded-xl px-2.5 py-1.5 text-xs font-semibold ${themeStyles.badge}`}
                >
                  👤 {currentUser.email?.split("@")[0]}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-slate-300/80 px-3 py-1.5 text-xs font-semibold transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError("");
                  setIsAuthModalOpen(true);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition shadow-md ${themeStyles.accent}`}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[320px_1fr] relative z-10">
        <aside
          className={`h-fit rounded-3xl border p-5 transition-all duration-300 ${themeStyles.card}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight">
              Your Document
            </h2>
            <span className={`text-xs ${themeStyles.subtleText}`}>
              Multi-PDF
            </span>
          </div>
          <p className={`mt-0.5 text-xs ${themeStyles.subtleText}`}>
            Upload PDFs to ask questions, summarize, and extract data.
          </p>

          <label
            className={`mt-4 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 hover:scale-[1.01] ${themeStyles.accentBorder}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-2xl">
              📂
            </div>
            <span className="mt-3 text-sm font-semibold">
              Choose or drag PDF files
            </span>
            <span className={`mt-1 text-[11px] ${themeStyles.subtleText}`}>
              PDF only · Up to 5 files · Max 10 MB each
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {file && (
            <div className="mt-4 break-words rounded-lg bg-indigo-50 p-3">
              <p className="text-sm font-medium text-indigo-900">
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Selected PDFs ({selectedFiles.length})
                    </p>

                    {selectedFiles.map((selectedFile, index) => (
                      <div
                        key={`${selectedFile.name}-${index}`}
                        className="rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <p className="truncate text-sm font-medium text-slate-700">
                          {selectedFile.name}
                        </p>

                        <p className="text-xs text-slate-500">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </p>
              <p className="mt-1 text-xs text-indigo-700">
                {(file.size / (1024 * 1024)).toFixed(2)} MB · Selected locally
              </p>
            </div>
          )}

          {file && (
            <button
              type="button"
              disabled={
                isAIProcessing || isUploading || selectedFiles.length === 0
              }
              onClick={handleUpload}
              className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {isUploading
                ? "Uploading..."
                : selectedFiles.length > 1
                  ? "Upload All PDFs"
                  : "Upload PDF"}
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {isUploading && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />

              <span>Uploading and processing your PDFs. Please wait...</span>
            </div>
          )}

          {uploadStatus && (
            <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {uploadStatus}
            </div>
          )}

          {isLoadingSavedDocuments && (
            <p className="mt-4 text-sm text-slate-500">
              Loading your saved documents...
            </p>
          )}

          {uploadedDocuments.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  Uploaded Documents
                </h3>

                {detailsDocument && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-900">
                        Document Details
                      </h3>

                      <button
                        type="button"
                        onClick={() => setDetailsDocument(null)}
                        className="rounded-lg px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        Close
                      </button>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-slate-500">File name</p>
                        <p className="break-all font-medium text-slate-900">
                          {detailsDocument.fileName}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Total pages</p>
                        <p className="font-medium text-slate-900">
                          {detailsDocument.totalPages}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">File size</p>
                        <p className="font-medium text-slate-900">
                          {detailsDocument.fileSize
                            ? `${(detailsDocument.fileSize / 1024).toFixed(2)} KB`
                            : "Not available"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Upload date</p>
                        <p className="font-medium text-slate-900">
                          {detailsDocument.createdAt
                            ? new Date(
                                detailsDocument.createdAt,
                              ).toLocaleString()
                            : "Not available"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Extracted text</p>
                        <p className="font-medium text-slate-900">
                          {detailsDocument.text
                            ? `${detailsDocument.text.length.toLocaleString()} characters`
                            : "Not loaded into the application"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">AI Chat Status</p>

                        <p
                          className={`font-medium ${
                            selectedSavedDocumentIds.includes(
                              detailsDocument.id,
                            )
                              ? "text-green-600"
                              : "text-slate-500"
                          }`}
                        >
                          {selectedSavedDocumentIds.includes(detailsDocument.id)
                            ? "Selected for AI chat"
                            : "Not selected for AI chat"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
                  {uploadedDocuments.length} PDF(s)
                </span>
              </div>

              <div className="space-y-2">
                <div className="mb-4 space-y-3">
                  <input
                    type="text"
                    value={documentSearch}
                    onChange={(event) => setDocumentSearch(event.target.value)}
                    placeholder="Search saved documents..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />

                  <select
                    value={documentSort}
                    onChange={(event) =>
                      setDocumentSort(
                        event.target.value as "newest" | "oldest" | "name",
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </div>

                {filteredDocuments.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-slate-500">
                      {documentSearch.trim()
                        ? "No documents match your search."
                        : "No saved documents yet."}
                    </p>

                    {documentSearch.trim() && (
                      <button
                        type="button"
                        onClick={() => setDocumentSearch("")}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                ) : (
                  filteredDocuments.map((document) => (
                    <div
                      key={document.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                          <span className="text-sm">📄</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-medium text-slate-800"
                            title={document.fileName}
                          >
                            {document.fileName}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {document.totalPages} page(s)
                            {document.fileSize
                              ? ` · ${(document.fileSize / (1024 * 1024)).toFixed(2)} MB`
                              : ""}
                          </p>

                          {document.createdAt && (
                            <p className="mt-1 text-xs text-slate-400">
                              Saved on{" "}
                              {new Date(
                                document.createdAt,
                              ).toLocaleDateString()}
                            </p>
                          )}

                          <span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                            Processed
                          </span>
                          <label className="mt-3 flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={
                                isUpdatingSavedDocuments || isAIProcessing
                              }
                              checked={selectedSavedDocumentIds.includes(
                                document.id,
                              )}
                              onChange={(event) =>
                                handleToggleSavedDocument(
                                  document,
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300"
                            />

                            <span className="text-xs font-medium text-slate-600">
                              Include in AI chat
                            </span>
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenPreview(document)}
                        className="mt-3 w-full rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100/80 hover:scale-[1.01]"
                      >
                        <span className="mr-1">👁</span>
                        Preview PDF
                      </button>

                      <button
                        type="button"
                        disabled={isUpdatingSavedDocuments || isAIProcessing}
                        onClick={() => handleLoadSavedDocument(document)}
                        className="mt-2.5 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUpdatingSavedDocuments
                          ? "Loading document..."
                          : "Load for AI Chat"}
                      </button>

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isUpdatingSavedDocuments || isAIProcessing}
                          onClick={() => handleDeleteSavedDocument(document.id)}
                          className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 hover:border-red-300"
                        >
                          Delete
                        </button>

                        <button
                          type="button"
                          onClick={() => setDetailsDocument(document)}
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-400"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mt-5 mb-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200/60 bg-slate-100/70 p-3 text-center transition hover:bg-slate-100">
              <p className="text-xl font-bold tracking-tight text-slate-900">
                {uploadedDocuments.length}
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                Total PDFs
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-slate-100/70 p-3 text-center transition hover:bg-slate-100">
              <p className="text-xl font-bold tracking-tight text-slate-900">
                {selectedSavedDocumentIds.length}
              </p>
              <p className="text-[11px] font-medium text-slate-500">Selected</p>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-slate-100/70 p-3 text-center transition hover:bg-slate-100">
              <p className="text-xl font-bold tracking-tight text-slate-900">
                {filteredDocuments.length}
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                Displayed
              </p>
            </div>
          </div>

          {extractedText && (
            <button
              type="button"
              onClick={handleClearDocument}
              disabled={isAIProcessing}
              className="mt-3 w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Clear Document
            </button>
          )}

          {extractedText && (
            <button
              type="button"
              onClick={handleSummarize}
              disabled={isAIProcessing}
              className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSummarizing ? "Generating Summary..." : "Generate Summary"}
            </button>
          )}

          {extractedText && (
            <button
              type="button"
              onClick={handleExtractKeyPoints}
              disabled={isAIProcessing}
              className="mt-3 w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExtracting
                ? "Extracting Information..."
                : "Extract Key Points"}
            </button>
          )}

          {extractedText && (
            <button
              type="button"
              onClick={handleExtractDetails}
              disabled={isAIProcessing}
              className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExtractingDetails
                ? "Extracting Important Details..."
                : "Extract Dates & Numbers"}
            </button>
          )}

          {extractedText && (
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Preview extracted text
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                {extractedText.slice(0, 5000)}
              </pre>
            </details>
          )}

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Upload PDFs, extract their content, and use AI to ask questions,
            generate summaries, and discover important information.
          </p>
        </aside>

        <section
          className={`flex min-h-[580px] flex-col overflow-hidden rounded-3xl border transition-all duration-300 ${themeStyles.card}`}
        >
          <div className="flex items-center justify-between border-b border-inherit px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Interactive AI Chat
                </h2>
                {extractedText && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Knowledge Active
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-xs ${themeStyles.subtleText}`}>
                {extractedText
                  ? "Your documents are indexed and ready for deep question answering with citations."
                  : "Upload or select a PDF from your library to start chatting."}
              </p>
              {selectedSavedDocumentIds.length > 0 && (
                <p className="mt-2 text-sm font-medium text-indigo-600">
                  {selectedSavedDocumentIds.length} saved document(s) selected
                  for AI chat.
                </p>
              )}

              {extractedText && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      AI Context Usage
                    </span>

                    <span className="text-xs text-slate-500">
                      {extractedText.length.toLocaleString()} / 100,000
                      characters
                    </span>
                  </div>

                  {selectedSavedDocumentIds.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          Documents Used in AI Chat
                        </p>

                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                            {selectedSavedDocumentIds.length} selected
                          </span>

                          <button
                            type="button"
                            disabled={
                              isUpdatingSavedDocuments || isAIProcessing
                            }
                            onClick={() => {
                              setSelectedSavedDocumentIds([]);
                              setSavedDocumentsText("");
                              setMessages([]);
                              setDetailsDocument(null);
                            }}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {uploadedDocuments
                          .filter((document) =>
                            selectedSavedDocumentIds.includes(document.id),
                          )
                          .map((document) => (
                            <div
                              key={document.id}
                              className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2"
                            >
                              <span className="text-sm">📄</span>

                              <div>
                                <p className="max-w-[220px] truncate text-xs font-medium text-slate-800">
                                  {document.fileName}
                                </p>

                                <p className="text-xs text-slate-500">
                                  {document.totalPages} pages
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        extractedText.length > 80000
                          ? "bg-amber-500"
                          : "bg-blue-600"
                      }`}
                      style={{
                        width: `${Math.min(
                          (extractedText.length / 100000) * 100,
                          100,
                        )}%`,
                      }}
                    />
                  </div>

                  {extractedText.length > 80000 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Your document context is getting large. Consider selecting
                      fewer documents for better AI response performance.
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isAIProcessing}
              onClick={handleNewChat}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + New Chat
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-6">
            {previewDocument && (
              <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* Preview header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800">
                      PDF Preview
                    </h3>

                    <p className="truncate text-xs text-slate-500">
                      {previewDocument.fileName}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleClosePreview}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Close Preview ✕
                  </button>
                </div>

                {/* Page navigation */}
                <div className="flex items-center justify-center gap-4 border-b border-slate-200 bg-slate-50 p-3">
                  <button
                    type="button"
                    onClick={handlePreviousPage}
                    disabled={previewPage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <span className="text-sm font-medium text-slate-700">
                    Page {previewPage} of {previewDocument.totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={previewPage >= previewDocument.totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>

                {/* PDF viewer */}
                {previewUrl && (
                  <iframe
                    key={`${previewDocument.id}-${previewPage}`}
                    src={`${previewUrl}#page=${previewPage}`}
                    title={`Preview of ${previewDocument.fileName}`}
                    className="h-[650px] w-full bg-slate-100"
                  />
                )}
              </div>
            )}

            {summary && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-indigo-950">
                    Document Summary
                  </h3>

                  <span className="text-xs font-medium text-indigo-600">
                    AI Generated
                  </span>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {summary}
                </div>
              </div>
            )}

            {keyPoints && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-950">
                    Extracted Document Insights
                  </h3>

                  <span className="text-xs font-medium text-emerald-700">
                    AI Generated
                  </span>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {keyPoints}
                </div>
              </div>
            )}

            {importantDetails && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-blue-950">
                    Important Dates & Numbers
                  </h3>

                  <span className="text-xs font-medium text-blue-700">
                    AI Generated
                  </span>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {importantDetails}
                </div>
              </div>
            )}

            {isExtractingDetails && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Extracting important details...
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Finding dates, deadlines, financial values, statistics, and
                  other numerical information.
                </p>
              </div>
            )}

            {isExtracting && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Extracting document insights...
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Identifying key points, requirements, and action items.
                </p>
              </div>
            )}

            {isSummarizing && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Analyzing your document...
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Gemini is extracting the important information.
                </p>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="m-auto max-w-md py-10 text-center">
                <div className="text-5xl">✦</div>
                <h3 className="mt-4 text-lg font-semibold">
                  Your document, ready for questions
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Upload a PDF, then ask about its key points, requirements, or
                  important details.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-5 py-3.5 text-sm leading-relaxed transition-all duration-200 ${
                    message.role === "user"
                      ? `ml-auto ${themeStyles.chatUser} shadow-sm`
                      : `mr-auto border ${themeStyles.chatAi}`
                  }`}
                >
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider opacity-75">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  {message.role === "assistant"
                    ? formatAnswer(message.content)
                    : message.content}
                </div>
              ))
            )}
            {isAsking && (
              <div
                className={`mr-auto max-w-[85%] rounded-3xl border px-5 py-4 text-sm ${themeStyles.chatAi} flex items-center gap-3`}
              >
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                    Assistant
                  </p>
                  <p className="text-xs opacity-90 mt-0.5">
                    Searching document passages and synthesizing response...
                  </p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-inherit p-4">
            {error && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <p
                  role="alert"
                  className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                >
                  {error}
                </p>

                {question.trim() && extractedText && (
                  <button
                    type="submit"
                    disabled={isAIProcessing}
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a question with citations about your documents..."
                aria-label="Your question"
                className={`min-w-0 flex-1 rounded-2xl border px-4 py-3.5 text-sm outline-none transition-all duration-200 shadow-xs focus:ring-2 ${themeStyles.input}`}
              />
              <button
                type="submit"
                disabled={isAIProcessing || !question.trim() || !extractedText}
                className={`flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${themeStyles.accent}`}
              >
                {isAsking ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <span>Ask</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* History Drawer Modal */}
      {isHistoryDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <div className="h-full w-full max-w-md bg-white p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <h3 className="text-lg font-bold text-slate-800">
                  Chat History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-3">
              {chatSessions.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No saved conversations yet. Start asking questions to save
                  chat history!
                </div>
              ) : (
                chatSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleLoadChatSession(session)}
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      currentSessionId === session.id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-800 line-clamp-1">
                        {session.title || "Untitled Chat"}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChatSession(session.id, e)}
                        className="text-xs text-red-500 hover:text-red-700"
                        title="Delete conversation"
                      >
                        🗑️
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {session.updated_at
                        ? new Date(session.updated_at).toLocaleString()
                        : "Recent"}
                    </p>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                handleNewChat();
                setIsHistoryDrawerOpen(false);
              }}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + Start Fresh Chat
            </button>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {authMode === "login"
                  ? "Sign In to Your Account"
                  : "Create a New Account"}
              </h3>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="mt-4 space-y-4">
              {authError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {authError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Must be at least 6 characters
                </p>
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isAuthLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-500">
              {authMode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                    }}
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    Log In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
