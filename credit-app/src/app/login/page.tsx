import AuthScreen from "@/components/auth/AuthScreen";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F0]" />}>
      <AuthScreen />
    </Suspense>
  );
}
