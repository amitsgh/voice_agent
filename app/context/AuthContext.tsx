"use client";

import { useRouter } from "next/navigation";
import React, {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { callAuthTokenRefresh, callAuthVerify } from "../lib/graphql";

export interface User {
	id: string;
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	address: string;
}

interface AuthContextType {
	user: User | null;
	accessToken: string | null;
	isInitialized: boolean;
	requestOtp: (
		phone: string,
		countryCode: string,
	) => Promise<{ success: boolean; error?: string }>;
	verifyOtp: (
		phone: string,
		countryCode: string,
		otp: string,
	) => Promise<{ success: boolean; error?: string }>;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // refresh tokens every 10 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [isInitialized, setIsInitialized] = useState(false);
	const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const router = useRouter();

	// ── Restore session from localStorage ─────────────────────────────────────
	useEffect(() => {
		// Clean up legacy keys from the old auto-auth approach
		localStorage.removeItem("user");
		localStorage.removeItem("refresh_token");

		const storedUser = localStorage.getItem("nuoro_user");
		const storedToken = localStorage.getItem("auth_token");

		if (storedUser && storedToken) {
			setUser(JSON.parse(storedUser));
			setAccessToken(storedToken);
		}

		setIsInitialized(true);
	}, []);

	// ── Auto-refresh access token using refresh token ──────────────────────────
	useEffect(() => {
		if (!accessToken) return;

		const scheduleRefresh = () => {
			if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

			refreshTimerRef.current = setInterval(async () => {
				const storedRefresh = localStorage.getItem("refresh_token");
				if (!storedRefresh) return;

				try {
					const res = await callAuthTokenRefresh(storedRefresh);
					const payload = res.data?.AuthTokenRefresh;
					if (payload?.accessToken) {
						setAccessToken(payload.accessToken);
						localStorage.setItem("auth_token", payload.accessToken);
						localStorage.setItem(
							"refresh_token",
							payload.refreshToken,
						);
						console.log(
							"[AuthContext] Access token refreshed successfully.",
						);
					} else {
						console.warn(
							"[AuthContext] Token refresh failed — logging out.",
						);
						logout();
					}
				} catch (err) {
					console.error("[AuthContext] Token refresh error:", err);
				}
			}, REFRESH_INTERVAL_MS);
		};

		scheduleRefresh();

		return () => {
			if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [accessToken]);

	// ── OTP Request (simulated send) ───────────────────────────────────────────
	const requestOtp = async (
		_phone: string,
		_countryCode: string,
	): Promise<{ success: boolean; error?: string }> => {
		// OTP dispatch is handled server-side. Just advance to next step.
		return new Promise((resolve) =>
			setTimeout(() => resolve({ success: true }), 600),
		);
	};

	// ── OTP Verification via GraphQL ───────────────────────────────────────────
	const verifyOtp = async (
		phone: string,
		countryCode: string,
		otp: string,
	): Promise<{ success: boolean; error?: string }> => {
		// Prepend the 8899 test prefix if not already present
		let normalizedPhone = phone.replace(/\D/g, "");
		if (!normalizedPhone.startsWith("8899")) {
			normalizedPhone = "8899" + normalizedPhone;
		}

		try {
			const res = await callAuthVerify(normalizedPhone, countryCode, otp);

			if (res.errors?.length) {
				const msg = res.errors[0]?.message ?? "Verification failed.";
				console.error("[AuthContext] AuthVerify error:", msg);
				return { success: false, error: msg };
			}

			const payload = res.data?.AuthVerify;
			if (!payload?.accessToken) {
				return { success: false, error: "Missing tokens in response." };
			}

			setUser(payload.user);
			setAccessToken(payload.accessToken);
			localStorage.setItem("nuoro_user", JSON.stringify(payload.user));
			localStorage.setItem("auth_token", payload.accessToken);
			localStorage.setItem("refresh_token", payload.refreshToken);

			return { success: true };
		} catch (err) {
			console.error("[AuthContext] Network error:", err);
			return {
				success: false,
				error: "Network error. Please try again.",
			};
		}
	};

	// ── Logout ─────────────────────────────────────────────────────────────────
	const logout = () => {
		if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
		setUser(null);
		setAccessToken(null);
		localStorage.removeItem("nuoro_user");
		localStorage.removeItem("auth_token");
		localStorage.removeItem("refresh_token");
		router.push("/login");
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				accessToken,
				isInitialized,
				requestOtp,
				verifyOtp,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
