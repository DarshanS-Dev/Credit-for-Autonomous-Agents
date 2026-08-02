import { api } from "./client";
import type { TokenResponse } from "./types";
import type { SessionRole } from "@/lib/session";

export interface SignupPayload {
  role: SessionRole;
  name: string;
  email: string;
  password: string;
  public_key?: string;
}

export interface LoginPayload {
  role: SessionRole;
  email: string;
  password: string;
}

export function signup(payload: SignupPayload): Promise<TokenResponse> {
  return api.post<TokenResponse>("/auth/signup", payload, { skipAuth: true });
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return api.post<TokenResponse>("/auth/login", payload, { skipAuth: true });
}
