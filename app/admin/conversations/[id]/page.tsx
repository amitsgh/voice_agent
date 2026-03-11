"use client";

import { cn } from "@/lib/utils";
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	ClockIcon,
	PhoneIcon,
	SendIcon,
	ShieldAlertIcon,
	SparklesIcon,
	UserIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface TranscriptLine {
	role: "assistant" | "user";
	message: string;
	time_in_call_secs: number;
	isHuman?: boolean;
	sender?: string;
}

interface ConvDetail {
	conversation_id: string;
	status: string;
	start_time: number;
	duration_secs: number;
	user_name: string;
	user_phone: string | null;
	transcript_summary: string | null;
	summary_title: string | null;
	call_successful: string | null;
	transcript: TranscriptLine[];
}

function formatSecs(s: number) {
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${String(r).padStart(2, "0")}`;
}

export default function AdminConversationDetailPage() {
	const router = useRouter();
	const params = useParams();
	const id = params.id as string;

	const [detail, setDetail] = useState<ConvDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [takeover, setTakeover] = useState(false);
	const [takeoverLoading, setTakeoverLoading] = useState(false);
	const [messageInput, setMessageInput] = useState("");
	const [sending, setSending] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const fetchDetail = useCallback(async () => {
		try {
			const res = await fetch(`/api/admin/conversations/${id}`);
			const data = await res.json();
			setDetail(data);
		} catch (e) {
			console.error("Failed to fetch conversation detail", e);
		} finally {
			setLoading(false);
		}
	}, [id]);

	// Initial load + poll every 3s when live
	useEffect(() => {
		fetchDetail();
	}, [fetchDetail]);

	useEffect(() => {
		// Stop polling transcript only if it's strictly done AND not in a takeover
		if (detail?.status !== "in-progress" && !takeover) return;
		const interval = setInterval(fetchDetail, 3000);
		return () => clearInterval(interval);
	}, [detail?.status, takeover, fetchDetail]);

	// Poll takeover state directly from DB
	useEffect(() => {
		const pollTakeover = async () => {
			try {
				const res = await fetch(`/api/admin/takeover?conversation_id=${id}`);
				const data = await res.json();
				
				setTakeover((prev) => {
					// Toast if it just became active
					if (!prev && Boolean(data.is_active)) {
						toast.error("Handover Requested", {
							description: "Patient needs human assistance.",
							duration: 10000,
						});
					}
					return Boolean(data.is_active);
				});
			} catch (e) {
				console.error("Failed to poll takeover state", e);
			}
		};
		pollTakeover();
		const interval = setInterval(pollTakeover, 3000);
		return () => clearInterval(interval);
	}, [detail?.status, id]);

	// Auto-scroll transcript
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [detail?.transcript]);

	const handleTakeover = async (active: boolean) => {
		setTakeoverLoading(true);
		try {
			await fetch("/api/admin/takeover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ conversation_id: id, is_active: active }),
			});
			setTakeover(active);
		} catch (e) {
			console.error("Takeover failed", e);
		} finally {
			setTakeoverLoading(false);
		}
	};

	const handleResolve = async () => {
		setTakeoverLoading(true);
		try {
			await fetch("/api/admin/takeover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ conversation_id: id, is_active: false, resolved: true }),
			});
			setTakeover(false);
			toast.success("Conversation closed");
		} catch (e) {
			console.error("Resolve failed", e);
		} finally {
			setTakeoverLoading(false);
		}
	};

	const handleSendMessage = async () => {
		if (!messageInput.trim()) return;
		setSending(true);
		try {
			await fetch("/api/admin/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversation_id: id,
					text: messageInput.trim(),
					sender: "John",
				}),
			});
			setMessageInput("");
		} catch (e) {
			console.error("Send message failed", e);
		} finally {
			setSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const isLive = detail?.status === "in-progress" || takeover;

	return (
		<div className="min-h-screen bg-[#1C2D3B]">
			<div className="max-w-2xl mx-auto flex flex-col min-h-screen">
				{/* Header */}
				<div className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-white/10">
					<button
						onClick={() => router.push("/admin")}
						className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
					>
						<ArrowLeftIcon className="h-5 w-5" />
					</button>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<h1 className="text-white font-semibold text-base truncate">
								{detail?.user_name ?? "Loading…"}
							</h1>
							{isLive && (
								<span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/30 shrink-0">
									<span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
									Live
								</span>
							)}
						</div>
						<p className="text-white/40 text-xs font-mono truncate">{id}</p>
					</div>
				</div>

				{/* Metadata strip */}
				{detail && (
					<div className="flex items-center gap-4 px-4 py-2 border-b border-white/5 text-white/40 text-xs">
						<span className="flex items-center gap-1">
							<ClockIcon className="h-3 w-3" />
							{formatSecs(detail.duration_secs)}
						</span>
						{detail.user_phone && (
							<span className="flex items-center gap-1">
								<PhoneIcon className="h-3 w-3" />
								{detail.user_phone}
							</span>
						)}
						{detail.call_successful && (
							<span
								className={cn(
									"flex items-center gap-1 capitalize",
									detail.call_successful === "success"
										? "text-green-400/70"
										: "text-red-400/70",
								)}
							>
								<CheckCircleIcon className="h-3 w-3" />
								{detail.call_successful}
							</span>
						)}
					</div>
				)}

				{/* Summary */}
				{detail?.transcript_summary && (
					<div className="mx-4 mt-3 rounded-xl bg-[#243546] border border-white/10 px-4 py-3">
						<p className="text-white/50 text-[10px] font-bold uppercase tracking-wider mb-1">
							AI Summary
						</p>
						<p className="text-white/70 text-xs leading-relaxed">
							{detail.transcript_summary}
						</p>
					</div>
				)}

				{/* Takeover controls — only for live conversations */}
				{isLive && (
					<div className="mx-4 mt-3 rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
						style={{
							background: takeover
								? "rgba(196,104,67,0.08)"
								: "rgba(255,255,255,0.03)",
							borderColor: takeover
								? "rgba(196,104,67,0.3)"
								: "rgba(255,255,255,0.1)",
						}}
					>
						<div className="flex items-center gap-2">
							<ShieldAlertIcon
								className={cn(
									"h-4 w-4",
									takeover ? "text-[#C46843]" : "text-white/30",
									takeover && "animate-pulse"
								)}
							/>
							<div>
								<p
									className={cn(
										"text-sm font-medium",
										takeover ? "text-[#C46843]" : "text-white/60",
									)}
								>
									{takeover ? "Patient requested care team" : "AI is responding"}
								</p>
								<p className="text-white/30 text-xs">
									{takeover
										? "You are now in control. Messages you send appear in the chat."
										: "Click to take over this conversation"}
								</p>
							</div>
						</div>
						{takeover ? (
							<div className="flex items-center gap-2">
								<button
									onClick={() => handleTakeover(false)}
									disabled={takeoverLoading}
									className="shrink-0 rounded-xl bg-[#243546] border border-white/10 px-3 py-1.5 text-white/70 text-xs hover:text-white transition disabled:opacity-50"
								>
									Hand back to AI
								</button>
								<button
									onClick={handleResolve}
									disabled={takeoverLoading}
									className="shrink-0 rounded-xl bg-white/10 border border-white/20 px-3 py-1.5 text-white/90 text-xs hover:bg-white/20 transition disabled:opacity-50"
								>
									Mark Resolved
								</button>
							</div>
						) : (
							<button
								onClick={() => handleTakeover(true)}
								disabled={takeoverLoading}
								className="shrink-0 rounded-xl bg-[#C46843]/90 px-3 py-1.5 text-white text-xs font-medium hover:bg-[#C46843] transition disabled:opacity-50"
							>
								Take Over
							</button>
						)}
					</div>
				)}

				{/* Transcript */}
				<div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3 mt-2">
					{loading ? (
						<div className="flex flex-col gap-3 animate-pulse">
							{[1, 2, 3, 4].map((i) => (
								<div key={i} className="flex gap-3">
									<div className="h-7 w-7 rounded-full bg-white/10 shrink-0" />
									<div className="h-12 flex-1 rounded-2xl bg-white/10" />
								</div>
							))}
						</div>
					) : detail?.transcript.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-32 gap-2">
							<p className="text-white/30 text-sm">No transcript yet</p>
						</div>
					) : (
						detail?.transcript.map((msg, i) => (
							<div
								key={i}
								className={cn(
									"flex gap-2",
									msg.role === "user" && "flex-row-reverse",
								)}
							>
								<div
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
										msg.role === "assistant"
											? msg.isHuman
												? "border-[#4A7FA5]/50 bg-[#4A7FA5]/10"
												: "border-[#C46843]/50 bg-[#C46843]/10"
											: "border-[#4A7FA5]/50 bg-[#4A7FA5]/10",
									)}
								>
									{msg.role === "assistant" ? (
										msg.isHuman ? (
											<UserIcon className="h-3.5 w-3.5 text-[#4A7FA5]" />
										) : (
											<SparklesIcon className="h-3.5 w-3.5 text-[#C46843]" />
										)
									) : (
										<UserIcon className="h-3.5 w-3.5 text-[#4A7FA5]" />
									)}
								</div>
								<div
									className={cn(
										"flex flex-col gap-1 max-w-[80%]",
										msg.role === "user" && "items-end",
									)}
								>
									{msg.role === "assistant" && msg.isHuman && (
										<div className="flex items-center gap-2">
											<span className="text-white/70 text-xs font-medium">
												{msg.sender ?? "John"}
											</span>
											<span className="rounded px-1.5 py-px text-[10px] font-semibold tracking-wider bg-[#4A7FA5]/20 text-[#4A7FA5]">
												CARE TEAM
											</span>
										</div>
									)}
									<div
										className={cn(
											"rounded-2xl px-3 py-2 text-sm leading-relaxed",
											msg.role === "assistant"
												? msg.isHuman
													? "bg-[#1E3448] border border-[#4A7FA5]/30 text-white rounded-tl-sm"
													: "bg-[#243546] text-white rounded-tl-sm"
												: "bg-[#4A7FA5]/20 text-white rounded-tr-sm",
										)}
									>
										{msg.message}
									</div>
									<span className="text-white/25 text-[10px]">
										{formatSecs(msg.time_in_call_secs)}
									</span>
								</div>
							</div>
						))
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* Message input — only during takeover */}
				{isLive && takeover && (
					<div className="border-t border-white/10 bg-[#1C2D3B] p-3">
						<div className="flex items-end gap-2 rounded-2xl bg-white/5 border border-[#C46843]/30 p-2">
							<textarea
								value={messageInput}
								onChange={(e) => setMessageInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Type a message as John…"
								rows={1}
								className="flex-1 resize-none bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none px-2 py-1 max-h-24"
							/>
							<button
								onClick={handleSendMessage}
								disabled={!messageInput.trim() || sending}
								className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#C46843] text-white disabled:opacity-40 hover:bg-[#C46843]/80 transition"
							>
								<SendIcon className="h-4 w-4" />
							</button>
						</div>
						<p className="text-white/25 text-[10px] text-center mt-2">
							Messages appear in the patient's chat as "John (Care Team)"
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
