"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyAgents } from "@/lib/api/agents";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";

export default function UploadCVPage() {
  const { session } = useSession();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      // Reset input
      const fileInput = document.getElementById("cv-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An error occurred during upload." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="font-mono text-4xl font-bold mb-8">Upload Agent CV</h1>
      <Card className="p-6">
        <form onSubmit={handleUpload} className="space-y-6">
          
          <div>
            <label htmlFor="agent-select" className="block font-mono text-sm font-bold text-text-primary uppercase mb-2">
              Select Agent
            </label>
            {isLoadingAgents ? (
              <div className="font-mono text-sm text-text-secondary">Loading agents...</div>
            ) : (
              <select
                id="agent-select"
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  setMessage(null);
                }}
                className="w-full bg-transparent border-2 border-text-primary p-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">-- Choose an agent --</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="cv-upload" className="block font-mono text-sm font-bold text-text-primary uppercase mb-2">
              CV File (PDF, DOCX)
            </label>
            <input
              type="file"
              id="cv-upload"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="w-full bg-transparent border-2 border-text-primary p-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-text-primary file:text-[#F5F5F0] file:font-mono file:text-xs file:uppercase file:cursor-pointer hover:file:bg-accent hover:file:text-white transition-colors"
            />
            {file && (
              <p className="mt-2 font-mono text-xs text-text-secondary">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {message && (
            <div className={`p-4 font-mono text-sm border-l-4 ${message.type === "success" ? "border-green-500 bg-green-500/10 text-green-700" : "border-red-500 bg-red-500/10 text-red-700"}`}>
              {message.text}
            </div>
          )}

          <Button 
            type="submit" 
            disabled={isUploading || !file || !selectedAgentId}
            className="w-full"
          >
            {isUploading ? "Uploading..." : "Upload CV"}
          </Button>

        </form>
      </Card>
    </div>
  );
}
