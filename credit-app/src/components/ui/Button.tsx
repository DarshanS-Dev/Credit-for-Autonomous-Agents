import React from "react";
import { Icon, IconType } from "./Icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconType;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = "primary", 
  icon,
  children, 
  className = "", 
  ...props 
}) => {
  const paddingClass = icon ? "pl-6 pr-4 py-3" : "px-8 py-3";
  const baseStyle = `inline-flex items-center justify-center gap-3 ${paddingClass} font-mono text-sm tracking-widest uppercase font-bold transition-all duration-200 relative active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none border-2`;
  
  let variantStyle = "";
  if (variant === "primary") {
    variantStyle = "bg-text-primary text-[#F5F5F0] border-text-primary hover:bg-transparent hover:text-text-primary hover:shadow-[4px_4px_0px_rgba(27,23,34,1)]";
  } else if (variant === "secondary") {
    variantStyle = "bg-transparent text-text-primary border-text-primary hover:bg-text-primary hover:text-[#F5F5F0]";
  } else if (variant === "ghost") {
    variantStyle = "bg-transparent text-text-secondary border-text-secondary/30 hover:border-text-primary hover:text-text-primary";
  } else if (variant === "danger") {
    variantStyle = "bg-[#8B4343] text-[#F5F5F0] border-[#8B4343] hover:bg-transparent hover:text-[#8B4343]";
  }

  return (
    <button 
      className={`${baseStyle} ${variantStyle} ${className}`} 
      {...props}
    >
      <span className="relative z-10 font-bold">{children}</span>
      {icon && (
        <span className="relative z-10 flex items-center justify-center">
          <Icon name={icon} size={16} />
        </span>
      )}
    </button>
  );
};

