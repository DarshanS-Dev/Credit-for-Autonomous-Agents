"use client";

import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyAgents } from "@/lib/api/agents";
import { useSession } from "@/context/SessionContext";
import { Icon } from "@/components/ui/Icon";
import { motion, AnimatePresence } from "framer-motion";

export default function UploadCVPage() {
  const { session } = useSession();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["agents", "mine"],
    queryFn: listMyAgents,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setMessage(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setMessage({ type: "error", text: "Please select an agent." });
      return;
    }
    if (!file) {
      setMessage({ type: "error", text: "Please select a file to upload." });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/agents/${selectedAgentId}/cv`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload CV");
      }

      setMessage({ type: "success", text: "CV uploaded successfully!" });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An error occurred during upload." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-xl relative z-10"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-text-primary mb-3">
            Upload Agent Resume
          </h1>
          <p className="text-text-secondary text-sm">
            Securely upload historical background and CVs for your agents.
          </p>
        </div>

        <div className="bg-white/40 dark:bg-[#1A1A1A]/60 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.05)]">
          <form onSubmit={handleUpload} className="space-y-8">
            
            {/* Agent Selection */}
            <div className="space-y-3">
              <label htmlFor="agent-select" className="text-sm font-semibold text-text-primary block">
                Target Agent
              </label>
              <div className="relative">
                {isLoadingAgents ? (
                  <div className="w-full bg-black/5 dark:bg-white/5 rounded-xl p-4 text-sm text-text-secondary animate-pulse">
                    Loading your agents...
                  </div>
                ) : (
                  <select
                    id="agent-select"
                    value={selectedAgentId}
                    onChange={(e) => {
                      setSelectedAgentId(e.target.value);
                      setMessage(null);
                    }}
                    className="w-full appearance-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 pr-10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer"
                  >
                    <option value="" disabled>Choose an agent...</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>
            </div>

            {/* File Upload Area */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-text-primary block">
                Document Upload
              </label>
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative group flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${
                  file ? 'border-blue-500 bg-blue-500/5' : 'border-black/10 dark:border-white/10 hover:border-blue-400 hover:bg-blue-400/5'
                }`}
              >
                <input
                  type="file"
                  id="cv-upload"
                  ref={fileInputRef}
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <AnimatePresence mode="wait">
                  {file ? (
                    <motion.div 
                      key="file"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="flex flex-col items-center text-center p-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
                        <Icon name="file-text" size={24} />
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate max-w-[200px]">
                        {file.name}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-blue-500 mt-3 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Click or drag to replace
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="flex flex-col items-center text-center p-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary group-hover:scale-110 transition-transform duration-300 mb-3">
                        <Icon name="upload-cloud" size={24} />
                      </div>
                      <p className="text-sm font-medium text-text-primary">
                        Click to upload or drag & drop
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        PDF, DOCX up to 10MB
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Messages */}
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
                    message.type === "success" 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}
                >
                  <Icon name={message.type === 'success' ? 'check-circle' : 'alert-circle'} size={18} />
                  {message.text}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isUploading || !file || !selectedAgentId}
              className="w-full relative overflow-hidden group bg-text-primary text-[#F5F5F0] dark:bg-white dark:text-black font-semibold rounded-xl p-4 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isUploading ? (
                  <>
                    <span className="animate-spin inline-block"><Icon name="refresh-cw" size={18} /></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Icon name="send" size={18} />
                    Submit Document
                  </>
                )}
              </span>
              {!isUploading && !(!file || !selectedAgentId) && (
                <div className="absolute inset-0 h-full w-full bg-white/20 dark:bg-black/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              )}
            </button>

          </form>
        </div>
      </motion.div>
    </div>
  );
}
