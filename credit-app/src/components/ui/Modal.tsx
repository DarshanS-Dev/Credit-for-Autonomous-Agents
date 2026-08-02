"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  severity?: "normal" | "danger";
  children?: React.ReactNode;
  closeOnConfirm?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  severity = "normal",
  children,
  closeOnConfirm = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-text-primary/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
            className="relative z-10 w-full max-w-md p-2 bg-text-secondary/5 border border-text-secondary/10 rounded-[2rem]"
          >
            <div className="bg-[#F5F5F0] border-2 border-text-primary p-8 shadow-[8px_8px_0px_rgba(27,23,34,1)] relative">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-6 right-6 text-text-secondary hover:text-text-primary"
              >
                <Icon name="x" size={20} />
              </button>

              {/* Header */}
              <div className="flex items-start gap-4 mt-2 mb-6">
                {severity === "danger" && (
                  <div className="text-danger mt-1">
                    <Icon name="warning" size={24} />
                  </div>
                )}
                <div>
                  <h3 className="font-mono text-lg font-bold uppercase tracking-widest text-text-primary">
                    {title}
                  </h3>
                </div>
              </div>

              {/* Body */}
              <p className="text-sm text-text-secondary leading-relaxed mb-4">
                {description}
              </p>
              {children}

              {/* Footer */}
              <div className="flex justify-end gap-4 font-mono mt-6">
                <Button variant="ghost" onClick={onClose}>
                  {cancelLabel}
                </Button>
                <Button
                  variant={severity === "danger" ? "danger" : "primary"}
                  onClick={() => {
                    onConfirm();
                    if (closeOnConfirm) onClose();
                  }}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
