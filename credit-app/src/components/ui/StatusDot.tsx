import React from "react";

type StatusValue =
  | "active"
  | "starter-limit"
  | "defaulted"
  | "revoked"
  | "blacklisted"
  | "approved"
  | "denied"
  | "repaid"
  | "pending";

interface StatusDotProps {
  status: StatusValue | string;
  pulse?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, pulse = false }) => {
  const normalized =
    status === "approved" ? "active" : status === "blacklisted" ? "revoked" : status;

  let colorClass = "";
  if (normalized === "active") {
    colorClass = "bg-text-primary";
  } else if (normalized === "starter-limit") {
    colorClass = "bg-transparent border border-text-secondary";
  } else if (normalized === "defaulted" || normalized === "denied") {
    colorClass = "bg-danger";
  } else if (normalized === "repaid") {
    colorClass = "bg-base";
  } else {
    colorClass = "bg-text-secondary opacity-50";
  }

  const label =
    normalized === "starter-limit"
      ? "starter limit"
      : normalized === "approved"
      ? "active"
      : normalized;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-3.5 w-3.5">
        {pulse && normalized !== "starter-limit" && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              normalized === "active"
                ? "bg-text-primary"
                : normalized === "defaulted"
                ? "bg-danger"
                : "bg-text-secondary"
            }`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${colorClass}`} />
      </span>
      <span className="font-mono text-xs uppercase tracking-wider text-text-secondary">
        {label}
      </span>
    </span>
  );
};
