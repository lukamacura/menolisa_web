"use client";

import { Trash2 } from "lucide-react";

type DeleteConfirmationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName?: string;
  isLoading?: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
  error?: string | null;
};

export default function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  isLoading = false,
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
  error,
}: DeleteConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div 
        className="relative z-10 w-full max-w-md rounded-xl shadow-xl backdrop-blur-lg border border-white/30"
        style={{
          background: 'linear-gradient(135deg, rgba(219, 234, 254, 0.95) 0%, rgba(254, 243, 199, 0.95) 50%, rgba(252, 231, 243, 0.95) 100%)',
        }}
      >
        {/* Content */}
        <div className="p-6">
          <h2 className="text-xl font-semibold text-[#3D3D3D] mb-2">{title}</h2>
          <p className="text-sm text-[#6B6B6B] mb-4">{message}</p>
          {itemName && (
            <div className="mb-4 p-3 rounded-lg bg-white/40 backdrop-blur-sm border border-white/30">
              <p className="text-sm font-medium text-[#3D3D3D]">{itemName}</p>
            </div>
          )}
          {error && (
            <p className="mb-4 text-sm text-red-600 font-medium" role="alert">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-[#6B6B6B] bg-white/60 hover:bg-white/80 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {loadingLabel}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {confirmLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

