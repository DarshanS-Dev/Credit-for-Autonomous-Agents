import React from "react";
import { 
  Key, 
  Sliders, 
  Scroll, 
  Wallet, 
  Lock, 
  FolderGit2, 
  ShieldAlert, 
  Link2Off, 
  ShieldX, 
  AlertTriangle,
  Settings, 
  ChevronRight, 
  TrendingUp, 
  Activity, 
  ArrowLeft, 
  X, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Terminal
} from "lucide-react";

export type IconType = 
  | "key" 
  | "policy" 
  | "mandate" 
  | "wallet" 
  | "lock" 
  | "directory" 
  | "alert" 
  | "broken-link" 
  | "shield" 
  | "warning"
  | "settings"
  | "chevron-right"
  | "trending-up"
  | "activity"
  | "arrow-left"
  | "x"
  | "eye"
  | "eye-off"
  | "refresh-cw"
  | "terminal";

interface IconProps {
  name: IconType;
  className?: string;
  size?: number;
}

export const Icon: React.FC<IconProps> = ({ name, className = "", size = 24 }) => {
  switch (name) {
    case "key":
      return <Key className={className} size={size} strokeWidth={1} />;
    case "policy":
      return <Sliders className={className} size={size} strokeWidth={1} />;
    case "mandate":
      return <Scroll className={className} size={size} strokeWidth={1} />;
    case "wallet":
      return <Wallet className={className} size={size} strokeWidth={1} />;
    case "lock":
      return <Lock className={className} size={size} strokeWidth={1} />;
    case "directory":
      return <FolderGit2 className={className} size={size} strokeWidth={1} />;
    case "alert":
      return <ShieldAlert className={className} size={size} strokeWidth={1} />;
    case "broken-link":
      return <Link2Off className={className} size={size} strokeWidth={1} />;
    case "shield":
      return <ShieldX className={className} size={size} strokeWidth={1} />;
    case "warning":
      return <AlertTriangle className={className} size={size} strokeWidth={1} />;
    case "settings":
      return <Settings className={className} size={size} strokeWidth={1} />;
    case "chevron-right":
      return <ChevronRight className={className} size={size} strokeWidth={1} />;
    case "trending-up":
      return <TrendingUp className={className} size={size} strokeWidth={1} />;
    case "activity":
      return <Activity className={className} size={size} strokeWidth={1} />;
    case "arrow-left":
      return <ArrowLeft className={className} size={size} strokeWidth={1} />;
    case "x":
      return <X className={className} size={size} strokeWidth={1} />;
    case "eye":
      return <Eye className={className} size={size} strokeWidth={1} />;
    case "eye-off":
      return <EyeOff className={className} size={size} strokeWidth={1} />;
    case "refresh-cw":
      return <RefreshCw className={className} size={size} strokeWidth={1} />;
    case "terminal":
      return <Terminal className={className} size={size} strokeWidth={1} />;
    default:
      return null;
  }
};
