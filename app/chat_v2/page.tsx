"use client";

import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConversationBar } from "@/components/ui/conversation-bar";
import { cn } from "@/lib/utils";
import type { ChatMessage, DynamicVariables } from "@/types";
import { useAuth } from "../context/AuthContext";
import { CONTENT_TYPE_HEADER, CVALUE, DEVICE_ID } from "../lib/graphql";

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

function timeNow() {
	return new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

// ─── Fetch chat history ──────────────────────────────────────────────────────
async function loadPreviousMessages(userId: string): Promise<ChatMessage[]> {
	try {
		const res = await fetch(`/api/conversations?user_id=${userId}`);
		const data = await res.json();

		return (data.messages ?? []).map((entry: any) => ({
			role: entry.role === "user" ? "user" : "assistant",
			content: entry.message || entry.text || "",
			time: timeNow(),
		}));
	} catch (error) {
		console.error("Failed to load previous messages:", error);
		return [];
	}
}

export default function ChatV2Page() {
	const { user, accessToken, isInitialized, logout } = useAuth();
	const router = useRouter();
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const [messages, setMessages] = useState<ChatMessage[]>([]);

	useEffect(() => {
		if (isInitialized && (!user || !accessToken)) router.replace("/login");
	}, [isInitialized, user, accessToken, router]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	if (!isInitialized || !user || !accessToken) {
		return (
			<div className="flex h-screen items-center justify-center bg-[#1C2D3B]">
				<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
			</div>
		);
	}

	const dynamicVariables: DynamicVariables = {
		user_id: user.id,
		user_name: `${user.firstName} ${user.lastName}`.trim() || "Guest",
		first_name: user.firstName,
		last_name: user.lastName,
		user_phone: user.phone,
		access_token: accessToken,
		device_id: DEVICE_ID,
		cvalue: CVALUE,
		content_type: CONTENT_TYPE_HEADER,
	};

	return (
		<div className="flex h-screen max-w-md mx-auto overflow-y-auto flex-col bg-[#1C2D3B]">
			<div className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-white/10">
				<button
					onClick={() => router.back()}
					className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</button>
				<div className="flex-1">
					<h1 className="text-white font-semibold text-base leading-tight">
						Nuoro Care Team
					</h1>
					<div className="flex items-center gap-2 mt-0.5">
						<span className="flex items-center gap-1 text-white/50 text-xs">
							<SparklesIcon className="h-3 w-3" />
							AI-Assisted
						</span>
						<span className="text-white/30 text-xs">•</span>
						<span className="text-white/50 text-xs">
							Clinician-reviewed
						</span>
					</div>
				</div>
				<button
					onClick={logout}
					className="rounded-full border border-[#C46843]/60 px-3 py-1 text-[#C46843] text-xs font-medium hover:bg-[#C46843]/10 transition"
				>
					Sign out
				</button>
			</div>

			<div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
						<div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#C46843]/40 bg-[#C46843]/10">
							<SparklesIcon className="h-6 w-6 text-[#C46843]" />
						</div>
						<p className="text-white/60 text-sm leading-relaxed">
							Tap the microphone to start speaking with your{" "}
							<span className="text-white font-medium">
								Nuoro Care Assistant
							</span>
							.
						</p>
					</div>
				) : (
					messages.map((msg, i) => (
						<div
							key={i}
							className={cn(
								"flex gap-3",
								msg.role === "user" && "flex-row-reverse",
							)}
						>
							{/* Avatar */}
							{msg.role === "assistant" && (
								<div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-[#C46843]/50 bg-[#C46843]/10">
									<SparklesIcon className="h-4 w-4 text-[#C46843]" />
								</div>
							)}

							<div
								className={cn(
									"flex flex-col gap-1 max-w-[78%]",
									msg.role === "user" && "items-end",
								)}
							>
								{/* Label row */}
								{msg.role === "assistant" && (
									<div className="flex items-center gap-2">
										<span className="text-white/70 text-xs font-medium">
											Nuoro Care Assistant
										</span>
										<span className="rounded bg-[#C46843]/20 px-1.5 py-px text-[10px] font-semibold text-[#C46843] tracking-wider">
											AI ASSISTANT
										</span>
									</div>
								)}

								{/* Bubble */}
								<div
									className={cn(
										"rounded-2xl px-4 py-3 text-sm leading-relaxed",
										msg.role === "assistant"
											? "bg-[#243546] text-white rounded-tl-sm"
											: "bg-[#C46843] text-white rounded-tr-sm",
									)}
								>
									{msg.content}
								</div>
								<span className="text-white/30 text-xs">
									{msg.time}
								</span>
							</div>
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			<div className="border-t border-white/10 bg-[#1C2D3B]">
				<ConversationBar
					agentId={DEFAULT_AGENT_ID}
					dynamicVariables={dynamicVariables}
					onConnect={async () => {
						const history = await loadPreviousMessages(user.id);
						setMessages(history);
					}}
					onDisconnect={() => {}}
					onMessage={(message) =>
						setMessages((prev) => [
							...prev,
							{
								role:
									message.source === "user"
										? "user"
										: "assistant",
								content: message.message,
								time: timeNow(),
							},
						])
					}
					onSendMessage={(message) =>
						setMessages((prev) => [
							...prev,
							{ role: "user", content: message, time: timeNow() },
						])
					}
					onError={(error) =>
						console.error("Conversation error:", error)
					}
				/>
			</div>
		</div>
	);
}
