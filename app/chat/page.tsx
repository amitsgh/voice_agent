"use client";

import { ArrowLeftIcon, SparklesIcon, UserIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConversationBar } from "@/components/ui/conversation-bar";
import { cn } from "@/lib/utils";
import type { ChatMessage, DynamicVariables } from "@/types";
import { useAuth } from "../context/AuthContext";
import { CONTENT_TYPE_HEADER, CVALUE, DEVICE_ID } from "../lib/graphql";
import { MASTER_PROMPT } from "../prompts/master_prompt";

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

function timeNow() {
	return new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

async function loadHistory(
	userId: string,
	k: number,
): Promise<{ messages: ChatMessage[]; summaries: string[] }> {
	try {
		const res = await fetch(`/api/conversations?user_id=${userId}&k=${k}`);
		const data = await res.json();

		const messages = (data.messages ?? []).map((entry: any) => ({
			role: entry.role as "user" | "assistant" | "separator",
			content: entry.message || entry.text || "",
			time: timeNow(),
		}));

		const summaries = (data.summaries ?? [])
			.map((s: any) => s.summary)
			.filter(Boolean);

		return { messages, summaries };
	} catch (error) {
		console.error("Failed to load history:", error);
		return { messages: [], summaries: [] };
	}
}

// export default function ChatPage() {
function ChatPageInner() {
	const { user, accessToken, isInitialized, logout } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Read history settings from URL params set by the home page
	const historyEnabled = searchParams.get("history") !== "0";
	const historyK = Math.max(
		1,
		Math.min(20, parseInt(searchParams.get("k") ?? "5", 10)),
	);

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [summaries, setSummaries] = useState<string[]>([]);
	const [historyLoaded, setHistoryLoaded] = useState(false);

	// Takeover state
	const [conversationId, setConversationId] = useState<string | null>(null);
	const conversationIdRef = useRef<string | null>(null);
	const [isTakeover, setIsTakeover] = useState(false);
	const isTakeoverRef = useRef(false);
	const [isResolved, setIsResolved] = useState(false);
	const lastAdminMsgTimestamp = useRef<string | null>(null);
	const seenAdminMsgIds = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (isInitialized && (!user || !accessToken)) router.replace("/login");
	}, [isInitialized, user, accessToken, router]);

	useEffect(() => {
		if (!user || !isInitialized || historyLoaded) return;

		if (!historyEnabled) {
			// Skip history fetch entirely — fresh start
			setMessages([]);
			setSummaries([]);
			setHistoryLoaded(true);
			return;
		}

		loadHistory(user.id, historyK).then(({ messages, summaries }) => {
			setMessages(messages);
			setSummaries(summaries);
			setHistoryLoaded(true);
		});
	}, [user, isInitialized, historyLoaded, historyEnabled, historyK]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Poll takeover state every 3s
	useEffect(() => {
		if (!conversationId) return;
		const poll = async () => {
			try {
				const res = await fetch(
					`/api/admin/takeover?conversation_id=${conversationId}`,
				);
				const data = await res.json();
				if (data.resolved) {
					setIsResolved(true);
					setIsTakeover(false);
					isTakeoverRef.current = false;
				} else {
					setIsTakeover(Boolean(data.is_active));
					isTakeoverRef.current = Boolean(data.is_active);
				}
			} catch {
				/* ignore */
			}
		};
		poll();
		const interval = setInterval(poll, 3000);
		return () => clearInterval(interval);
	}, [conversationId]);

	// Poll admin messages every 3s during takeover
	useEffect(() => {
		if (!conversationId || !isTakeover) return;
		const poll = async () => {
			try {
				const since = lastAdminMsgTimestamp.current
					? `&since=${encodeURIComponent(lastAdminMsgTimestamp.current)}`
					: "";
				const res = await fetch(
					`/api/admin/message?conversation_id=${conversationId}${since}`,
				);
				const data = await res.json();
				const msgs = data.messages ?? [];
				const newMsgs = msgs.filter(
					(m: any) =>
						!seenAdminMsgIds.current.has(m.id) &&
						m.sender !== "patient",
				);
				if (newMsgs.length > 0) {
					newMsgs.forEach((m: any) =>
						seenAdminMsgIds.current.add(m.id),
					);
					lastAdminMsgTimestamp.current =
						newMsgs[newMsgs.length - 1].sent_at;
					setMessages((prev) => [
						...prev,
						...newMsgs.map((m: any) => ({
							role: "assistant" as const,
							content: m.text,
							time: new Date(m.sent_at).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							}),
							isHuman: true,
							sender: m.sender ?? "John",
						})),
					]);
				}
			} catch {
				/* ignore */
			}
		};
		poll();
		const interval = setInterval(poll, 3000);
		return () => clearInterval(interval);
	}, [conversationId, isTakeover]);

	if (!isInitialized || !user || !accessToken) {
		return (
			<div className="flex h-screen items-center justify-center bg-[#1C2D3B]">
				<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
			</div>
		);
	}

	// is_reconnect is true only if history is enabled AND there are past messages/summaries
	const is_reconnect =
		historyEnabled &&
		(messages.some((m) => m.role === "user") || summaries.length > 0);

	const lastSummary = summaries[0] ?? null;

	// For reconnects: SHORT neutral opener rendered verbatim by ElevenLabs.
	// The LLM-generated context-aware follow-up comes from the system prompt
	// instruction below — Hannah uses it on her first response after the patient replies.
	const greeting_message = is_reconnect
		? `Hi ${user.firstName}, welcome back!`
		: `Hi ${user.firstName}, this is Hannah from Nuoro Wellness. How can I help you today? I can help you book, cancel, or reschedule an appointment.`;

	let final_prompt = MASTER_PROMPT;

	if (historyEnabled && summaries.length > 0) {
		const summaryText = summaries
			.map((s, i) => `Session ${i + 1}: ${s}`)
			.join("\n\n");
		final_prompt += `\n\n# Past Conversation Summaries\nTo provide continuity, here are summaries of your past interactions with this user:\n\n${summaryText}`;
	}

	// Instruct Hannah to naturally reference the last session when the patient
	// replies — fires through the LLM so it reads naturally, not as a raw dump.
	if (is_reconnect && lastSummary) {
		final_prompt += `\n\n# Reconnect Instruction\nThe patient is returning. You have already greeted them with "Hi ${user.firstName}, welcome back!".\nWhen they reply, naturally acknowledge what happened in their last session in ONE sentence, then ask how you can help — do not re-introduce yourself.\nDo not repeat the summary word-for-word. Keep it warm and concise.\nLast session summary: ${lastSummary}`;
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
		is_reconnect,
	};

	return (
		<div className="min-h-screen bg-[#1C2D3B]">
			<div className="flex h-screen max-w-md mx-auto overflow-y-auto flex-col bg-[#1C2D3B]">
				{/* ── Header ── */}
				<div className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-white/10">
					<button
						onClick={() => router.push("/home")}
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
							{/* History mode indicator */}
							<span className="text-white/30 text-xs">•</span>
							<span
								className={cn(
									"text-xs font-medium",
									historyEnabled
										? "text-[#C46843]/80"
										: "text-white/30",
								)}
							>
								{historyEnabled
									? `${historyK} sessions`
									: "Fresh start"}
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

				{/* ── Messages ── */}
				<div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
					{!historyLoaded ? (
						/* Skeleton */
						<div className="flex flex-col gap-5 animate-pulse pt-2">
							{[78, 56, 64, 44, 52].map((w, i) => (
								<div
									key={i}
									className={cn(
										"flex gap-3",
										i % 2 === 1 && "flex-row-reverse",
									)}
								>
									{i % 2 === 0 && (
										<div className="flex-shrink-0 h-9 w-9 rounded-full bg-white/10" />
									)}
									<div
										className={cn(
											"flex flex-col gap-2 max-w-[78%]",
											i % 2 === 1 && "items-end",
										)}
									>
										{i % 2 === 0 && (
											<div className="h-3 w-28 rounded bg-white/10" />
										)}
										<div
											className={`h-${i % 2 === 0 ? "14" : "10"} w-${w} rounded-2xl bg-white/10`}
										/>
										<div className="h-2.5 w-10 rounded bg-white/5" />
									</div>
								</div>
							))}
						</div>
					) : messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
							<div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#C46843]/40 bg-[#C46843]/10">
								<SparklesIcon className="h-6 w-6 text-[#C46843]" />
							</div>
							<p className="text-white/60 text-sm leading-relaxed">
								{historyEnabled
									? "No past conversations found. "
									: "History is off — fresh start. "}
								<span className="text-white font-medium">
									Say hello to Hannah to get started.
								</span>
							</p>
						</div>
					) : (
						messages.map((msg, i) => {
							if (msg.role === "separator") {
								return (
									<div
										key={i}
										className="flex items-center gap-4 py-2"
									>
										<div className="h-px flex-1 bg-white/10" />
										<span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
											{msg.content}
										</span>
										<div className="h-px flex-1 bg-white/10" />
									</div>
								);
							}
							return (
								<div
									key={i}
									className={cn(
										"flex gap-3",
										msg.role === "user" &&
											"flex-row-reverse",
									)}
								>
									{msg.role === "assistant" && (
										<div
											className={cn(
												"flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border",
												(msg as any).isHuman
													? "border-[#4A7FA5]/50 bg-[#4A7FA5]/10"
													: "border-[#C46843]/50 bg-[#C46843]/10",
											)}
										>
											{(msg as any).isHuman ? (
												<UserIcon className="h-4 w-4 text-[#4A7FA5]" />
											) : (
												<SparklesIcon className="h-4 w-4 text-[#C46843]" />
											)}
										</div>
									)}
									<div
										className={cn(
											"flex flex-col gap-1 max-w-[78%]",
											msg.role === "user" && "items-end",
										)}
									>
										{msg.role === "assistant" && (
											<div className="flex items-center gap-2">
												<span className="text-white/70 text-xs font-medium">
													{(msg as any).isHuman
														? ((msg as any)
																.sender ??
															"John")
														: "Nuoro Care Assistant"}
												</span>
												<span
													className={cn(
														"rounded px-1.5 py-px text-[10px] font-semibold tracking-wider",
														(msg as any).isHuman
															? "bg-[#4A7FA5]/20 text-[#4A7FA5]"
															: "bg-[#C46843]/20 text-[#C46843]",
													)}
												>
													{(msg as any).isHuman
														? "CARE TEAM"
														: "AI ASSISTANT"}
												</span>
											</div>
										)}
										<div
											className={cn(
												"rounded-2xl px-4 py-3 text-sm leading-relaxed",
												msg.role === "assistant"
													? (msg as any).isHuman
														? "bg-[#1E3448] border border-[#4A7FA5]/30 text-white rounded-tl-sm"
														: "bg-[#243546] text-white rounded-tl-sm"
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
							);
						})
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* ── Input bar ── */}
				<div className="border-t border-white/10 bg-[#1C2D3B]">
					{isResolved ? (
						<div className="flex h-[150px] items-center justify-center">
							<div className="text-center space-y-2">
								<p className="text-white/70 font-medium">
									Conversation Ended
								</p>
								<p className="text-white/40 text-sm">
									The care team has closed this conversation.
								</p>
							</div>
						</div>
					) : (
						<ConversationBar
							agentId={DEFAULT_AGENT_ID}
							userId={user.id}
							dynamicVariables={dynamicVariables}
							overrides={{
								agent: {
									firstMessage: greeting_message,
									prompt: { prompt: final_prompt },
								},
								widget: { strip_audio_tags: true },
								conversation_config: {
									monitoring: { enabled: true },
								},
							}}
							autoStart={historyLoaded}
							onConnect={(convId?: string) => {
								if (convId) {
									setConversationId(convId);
									conversationIdRef.current = convId;
								}
							}}
							onDisconnect={() => {}}
							onMessage={(message) => {
								if (message.message?.trim()) {
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
									]);
								}
							}}
							isTakeover={isTakeover}
							onSendMessage={async (message) => {
								setMessages((prev) => [
									...prev,
									{
										role: "user",
										content: message,
										time: timeNow(),
									},
								]);
								if (
									isTakeoverRef.current &&
									conversationIdRef.current
								) {
									try {
										await fetch("/api/admin/message", {
											method: "POST",
											headers: {
												"Content-Type":
													"application/json",
											},
											body: JSON.stringify({
												conversation_id:
													conversationIdRef.current,
												text: message,
												sender: "patient",
											}),
										});
									} catch {
										/* ignore */
									}
								}
							}}
							onError={(error) =>
								console.error("Conversation error:", error)
							}
							onHandover={async (reason) => {
								const currentId = conversationIdRef.current;
								if (!currentId) return;
								try {
									await fetch("/api/admin/takeover", {
										method: "POST",
										headers: {
											"Content-Type": "application/json",
										},
										body: JSON.stringify({
											conversation_id: currentId,
											is_active: true,
										}),
									});
									setIsTakeover(true);
									isTakeoverRef.current = true;
								} catch (e) {
									console.error(
										"Failed to trigger takeover:",
										e,
									);
								}
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

import { Suspense } from "react";

export default function ChatPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen items-center justify-center bg-[#1C2D3B]">
					<div className="w-8 h-8 rounded-full border-2 border-[#C46843]/30 border-t-[#C46843] animate-spin" />
				</div>
			}
		>
			<ChatPageInner />
		</Suspense>
	);
}
