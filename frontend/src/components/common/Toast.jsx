import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success", customDuration) => {
    if (!message) return;
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    const duration = customDuration || (type === "success" ? 4000 : type === "error" ? 8000 : 5000);

    setToasts((prev) => {
      // Prevent duplicate notification text
      if (prev.some((t) => t.message === message)) return prev;
      return [...prev, { id, message, type }];
    });

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (msg) => console.log("Toast:", msg),
      removeToast: () => {},
    };
  }
  return ctx;
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }) {
  const { message, type } = toast;

  const getIcon = () => {
    switch (type) {
      case "error":
        return <span className="material-symbols-outlined text-red-600 text-xl">error</span>;
      case "warning":
        return <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>;
      case "info":
        return <span className="material-symbols-outlined text-teal-600 text-xl">info</span>;
      case "success":
      default:
        return <span className="material-symbols-outlined text-emerald-600 text-xl">check_circle</span>;
    }
  };

  const getBorder = () => {
    switch (type) {
      case "error":
        return "border-l-4 border-l-red-600";
      case "warning":
        return "border-l-4 border-l-amber-500";
      case "info":
        return "border-l-4 border-l-teal-600";
      case "success":
      default:
        return "border-l-4 border-l-emerald-600";
    }
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl bg-white shadow-xl border border-[#577877]/15 ${getBorder()} transform transition-all duration-300 animate-slide-in font-sans text-xs`}
    >
      <div className="shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 font-medium text-[#162623] leading-relaxed">{message}</div>
      <button
        onClick={onRemove}
        className="shrink-0 text-[#577877] hover:text-[#162623] p-0.5 rounded-md hover:bg-[#F0F5F7] transition cursor-pointer"
        aria-label="Close notification"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
