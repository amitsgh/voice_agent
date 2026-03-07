"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import {
	CVALUE,
	DEVICE_ID,
	callAuthTokenRefresh,
	callAuthVerify,
} from "../lib/graphql";

// ─── Fixed test credentials (phone already has 8899 prefix) ───────────────────
const TEST_PHONE = "88998866288880";
const TEST_COUNTRY_CODE = "+91";
const TEST_OTP = "011223";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

import type { AuthState } from "@/types";
export default function ChatPage() {
	const [auth, setAuth] = useState<AuthState | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// On mount: use cached auth or call AuthVerify with fixed test credentials
	useEffect(() => {
		async function initAuth() {
			const cached = localStorage.getItem("auth_token");
			const cachedUser = localStorage.getItem("user");
			const cachedRefresh = localStorage.getItem("refresh_token");

			if (cached && cachedUser) {
				try {
					const u = JSON.parse(cachedUser);
					setAuth({
						userId: u.id,
						firstName: u.firstName,
						lastName: u.lastName,
						phone: u.phone,
						accessToken: cached,
						refreshToken: cachedRefresh ?? "",
					});
					setLoading(false);
					return;
				} catch {
					// corrupt cache — fall through to fresh auth
				}
			}

			// Fresh auth with fixed test credentials
			const res = await callAuthVerify(
				TEST_PHONE,
				TEST_COUNTRY_CODE,
				TEST_OTP,
			);

			if (res.errors?.length) {
				setError(res.errors[0].message ?? "Auth failed");
				setLoading(false);
				return;
			}

			const data = res.data?.AuthVerify;
			if (!data) {
				setError("No data returned from AuthVerify");
				setLoading(false);
				return;
			}

			localStorage.setItem("auth_token", data.accessToken);
			localStorage.setItem("refresh_token", data.refreshToken);
			localStorage.setItem("user", JSON.stringify(data.user));

			setAuth({
				userId: data.user.id,
				firstName: data.user.firstName,
				lastName: data.user.lastName,
				phone: data.user.phone,
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
			});
			setLoading(false);
		}

		initAuth().catch((err) => {
			setError(err?.message ?? "Unknown error");
			setLoading(false);
		});
	}, []);

	// Refresh access token every 10 minutes using the refresh token
	useEffect(() => {
		if (!auth?.refreshToken) return;

		const timer = setInterval(
			async () => {
				const res = await callAuthTokenRefresh(auth.refreshToken);
				const fresh = res.data?.AuthTokenRefresh;
				if (fresh) {
					localStorage.setItem("auth_token", fresh.accessToken);
					localStorage.setItem("refresh_token", fresh.refreshToken);
					setAuth((prev) =>
						prev
							? {
									...prev,
									accessToken: fresh.accessToken,
									refreshToken: fresh.refreshToken,
								}
							: null,
					);
				}
			},
			10 * 60 * 1000,
		); // 10 minutes

		return () => clearInterval(timer);
	}, [auth?.refreshToken]);

	// ─── Loading state ─────────────────────────────────────────────────────────
	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-[#1A2C38]">
				<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
			</div>
		);
	}

	// ─── Error state ───────────────────────────────────────────────────────────
	if (error || !auth) {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#1A2C38] text-white">
				<p className="text-red-400 text-sm">
					Auth error: {error ?? "Unknown"}
				</p>
				<button
					className="text-xs text-white/50 hover:text-white underline"
					onClick={() => {
						localStorage.clear();
						window.location.reload();
					}}
				>
					Clear cache &amp; retry
				</button>
			</div>
		);
	}

	// ─── Dynamic variables passed to the widget ────────────────────────────────
	const dynamicVariables = JSON.stringify({
		user_id: auth.userId,
		user_name: `${auth.firstName} ${auth.lastName}`.trim() || "Guest",
		first_name: auth.firstName,
		last_name: auth.lastName,
		user_phone: auth.phone,
		// secret__ prefix tells ElevenLabs not to send this to the LLM in prompts
		access_token: auth.accessToken,
		device_id: DEVICE_ID,
		cvalue: CVALUE,
		content_type: "application/json",
	});

	return (
		<div className="flex h-screen w-full items-center justify-center bg-[#1A2C38]">
			{/* ElevenLabs Conversational AI widget */}
			<Script
				src="https://unpkg.com/@elevenlabs/convai-widget-embed"
				strategy="lazyOnload"
			/>
			<elevenlabs-convai
				agent-id={AGENT_ID}
				dynamic-variables={dynamicVariables}
			/>
		</div>
	);
}
