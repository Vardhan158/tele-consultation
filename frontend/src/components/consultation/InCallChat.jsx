import { useEffect, useRef, useState } from "react";

export default function InCallChat({
  socket,
  role = "patient",
  appointmentId,
  onClose,
  initialMessages = [],
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [inputMessage, setInputMessage] = useState("");
  const [attachment, setAttachment] = useState(null); // { name, type, size, data_url }
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, attachment]);

  // Listen for incoming socket chat messages
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("chat_message", handleMessage);

    return () => {
      socket.off("chat_message", handleMessage);
    };
  }, [socket]);

  const processFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit for in-call sharing.");
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      alert("Only images (PNG, JPG, WEBP) and PDF clinical reports are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachment({
        name: file.name,
        type: file.type,
        size: file.size,
        data_url: e.target.result,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = (e) => {
    e?.preventDefault?.();
    if (!inputMessage.trim() && !attachment) return;

    const payload = {
      appointmentId,
      text: inputMessage.trim(),
      file_attachment: attachment,
      sender_role: role,
    };

    if (socket) {
      socket.emit("chat_message", payload);
    } else {
      // Offline / fallback local message addition
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          sender_role: role,
          sender_name: role === "doctor" ? "Doctor (You)" : "You",
          text: inputMessage.trim(),
          file_attachment: attachment,
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    setInputMessage("");
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoString) => {
    try {
      const date = isoString ? new Date(isoString) : new Date();
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-white rounded-2xl border border-[#577877]/15 overflow-hidden shadow-lg transition-all ${
        isDragging ? "ring-2 ring-[#25836F] bg-teal-50/20" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#F0F5F7] border-b border-[#577877]/15">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#25836F] text-lg">chat</span>
          <h4 className="text-xs font-bold text-[#162623] uppercase tracking-wide">
            In-Call Clinical Chat &amp; Files
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Live Encrypted
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#577877] hover:text-[#162623] p-1 rounded-lg hover:bg-white/60 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3 min-h-[220px] max-h-[360px] bg-white">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#577877] space-y-2">
            <span className="material-symbols-outlined text-3xl text-[#25836F]/50">
              mark_chat_unread
            </span>
            <p className="text-xs font-semibold text-[#162623]">No messages yet</p>
            <p className="text-[11px] max-w-xs text-[#577877]">
              Send clinical questions or drop diagnostic photos/lab reports for instant consultation review.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_role === role;
            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#577877]">
                  <span className="font-bold text-[#162623]">
                    {isMe ? "You" : msg.sender_name || (msg.sender_role === "doctor" ? "Doctor" : "Patient")}
                  </span>
                  <span>·</span>
                  <span>{formatTime(msg.timestamp)}</span>
                </div>

                <div
                  className={`p-3 rounded-2xl text-xs max-w-[85%] shadow-xs space-y-2 ${
                    isMe
                      ? "bg-[#25836F] text-white rounded-tr-xs"
                      : "bg-[#F0F5F7] text-[#162623] border border-[#577877]/15 rounded-tl-xs"
                  }`}
                >
                  {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}

                  {/* File Attachment Card */}
                  {msg.file_attachment && (
                    <div
                      className={`p-2 rounded-xl flex items-center gap-2.5 transition border ${
                        isMe
                          ? "bg-black/15 border-white/20 text-white"
                          : "bg-white border-[#577877]/20 text-[#162623]"
                      }`}
                    >
                      {msg.file_attachment.type?.startsWith("image/") ? (
                        <img
                          src={msg.file_attachment.data_url}
                          alt={msg.file_attachment.name}
                          className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                          onClick={() => setPreviewImage(msg.file_attachment.data_url)}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center text-[#25836F] shrink-0">
                          <span className="material-symbols-outlined text-lg">description</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold truncate text-[11px]">
                          {msg.file_attachment.name}
                        </p>
                        <p className={`text-[10px] ${isMe ? "text-white/80" : "text-[#577877]"}`}>
                          {formatFileSize(msg.file_attachment.size)}
                        </p>
                      </div>

                      <a
                        href={msg.file_attachment.data_url}
                        download={msg.file_attachment.name}
                        target="_blank"
                        rel="noreferrer"
                        className={`p-1.5 rounded-lg hover:bg-black/10 transition shrink-0 ${
                          isMe ? "text-white" : "text-[#25836F]"
                        }`}
                        title="Download Attachment"
                      >
                        <span className="material-symbols-outlined text-base">download</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment Staging Area */}
      {attachment && (
        <div className="px-3 py-2 bg-teal-50/70 border-t border-teal-200/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {attachment.type?.startsWith("image/") ? (
              <img
                src={attachment.data_url}
                alt="Upload staging"
                className="w-8 h-8 object-cover rounded-md border border-teal-300"
              />
            ) : (
              <span className="material-symbols-outlined text-[#25836F]">description</span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#162623] truncate">{attachment.name}</p>
              <p className="text-[10px] text-[#577877]">{formatFileSize(attachment.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="text-rose-500 hover:text-rose-700 p-1 rounded-md"
            title="Remove attachment"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-[#F0F5F7] border-t border-[#577877]/15 flex items-center gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => processFile(e.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-[#577877] hover:text-[#25836F] hover:bg-white rounded-xl transition cursor-pointer shrink-0"
          title="Attach diagnostic image or report (PNG, JPG, PDF up to 5MB)"
        >
          <span className="material-symbols-outlined text-xl">attach_file</span>
        </button>

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={attachment ? "Add a message or press send…" : "Type clinical note or question…"}
          className="flex-1 px-3 py-2 text-xs bg-white rounded-xl border border-[#577877]/25 text-[#162623] focus:outline-none focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]"
        />

        <button
          type="submit"
          disabled={!inputMessage.trim() && !attachment}
          className="bg-[#25836F] disabled:opacity-40 hover:bg-[#1d6e5d] text-white p-2 rounded-xl transition shadow-xs cursor-pointer shrink-0 flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-lg">send</span>
        </button>
      </form>

      {/* Modal image preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-black/70 text-white rounded-full p-1.5 hover:bg-black transition"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
            <img
              src={previewImage}
              alt="Clinical attachment preview"
              className="w-full h-auto max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
