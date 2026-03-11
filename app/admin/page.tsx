"use client";

import {
	ArrowRightIcon,
	ClockIcon,
	PhoneIcon,
	RadioIcon,
	ShieldIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";

interface ConversationItem {
	conversation_id: string;
	status: string;
	start_time: number;
	duration_secs: number;
	transcript_summary: string | null;
	is_takeover?: boolean;
}

function formatDuration(secs: number) {
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return `${m}m ${s}s`;
}

function formatTime(unix: number) {
	return new Date(unix * 1000).toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function AdminPage() {
	const router = useRouter();
	const [tab, setTab] = useState<"live" | "history">("live");
	const [conversations, setConversations] = useState<ConversationItem[]>([]);
	const [loading, setLoading] = useState(true);

	async function fetchConversations() {
		try {
			const res = await fetch(
				`/api/admin/conversations?status=all&page_size=30`,
			);
			const data = await res.json();
			setConversations(data.conversations ?? []);
		} catch (e) {
			console.error("Failed to fetch conversations", e);
		} finally {
			setLoading(false);
		}
	}

	const knownTakeovers = useRef<Set<string>>(new Set());

	useEffect(() => {
		// Detect new takeovers and toast
		conversations.forEach((c) => {
			if (c.is_takeover && !knownTakeovers.current.has(c.conversation_id)) {
				knownTakeovers.current.add(c.conversation_id);
				toast.error("Handover Requested", {
					description: `Patient in conversation ${c.conversation_id.slice(-6)} needs human assistance.`,
					action: {
						label: 'View',
						onClick: () => router.push(`/admin/conversations/${c.conversation_id}`)
					},
					duration: 10000,
				});
			} else if (!c.is_takeover && knownTakeovers.current.has(c.conversation_id)) {
				// Handed back to AI, clear it so we can toast again if they ask again later
				knownTakeovers.current.delete(c.conversation_id);
			}
		});
	}, [conversations, router]);

	useEffect(() => {
		fetchConversations();
		// Poll every 5 seconds to catch new live conversations
		const interval = setInterval(fetchConversations, 5000);
		return () => clearInterval(interval);
	}, []);

	const live = conversations.filter((c) => c.status === "in-progress" || c.is_takeover);
	const history = conversations.filter((c) => c.status !== "in-progress" && !c.is_takeover);
	const displayed = tab === "live" ? live : history;

	return (
		<div className="min-h-screen bg-[#1C2D3B]">
			<div className="max-w-2xl mx-auto flex flex-col min-h-screen">
				{/* Header */}
				<div className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-white/10">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4A7FA5]/20 border border-[#4A7FA5]/50">
						<ShieldIcon className="h-4 w-4 text-[#4A7FA5]" />
					</div>
					<div className="flex-1">
						<h1 className="text-white font-semibold text-base">Admin Panel</h1>
						<p className="text-white/50 text-xs">John — Care Team</p>
					</div>
					{/* Live indicator */}
					{live.length > 0 && (
						<div className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 border border-red-500/30">
							<span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
							<span className="text-red-400 text-xs font-medium">
								{live.length} Live
							</span>
						</div>
					)}
				</div>

				{/* Tabs */}
				<div className="flex border-b border-white/10">
					{(["live", "history"] as const).map((t) => (
						<button
							key={t}
							onClick={() => setTab(t)}
							className={`flex-1 py-3 text-sm font-medium transition capitalize ${
								tab === t
									? "text-white border-b-2 border-[#C46843]"
									: "text-white/40 hover:text-white/70"
							}`}
						>
							{t === "live" ? (
								<span className="flex items-center justify-center gap-2">
									<RadioIcon className="h-3.5 w-3.5" />
									Live{live.length > 0 ? ` (${live.length})` : ""}
								</span>
							) : (
								<span className="flex items-center justify-center gap-2">
									<ClockIcon className="h-3.5 w-3.5" />
									History
								</span>
							)}
						</button>
					))}
				</div>

				{/* List */}
				<div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
					{loading ? (
						/* Skeleton */
						<div className="flex flex-col gap-3 animate-pulse">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="h-20 rounded-2xl bg-white/5"
								/>
							))}
						</div>
					) : displayed.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
							{tab === "live" ? (
								<>
									<RadioIcon className="h-8 w-8 text-white/20" />
									<p className="text-white/40 text-sm">
										No active conversations
									</p>
								</>
							) : (
								<>
									<ClockIcon className="h-8 w-8 text-white/20" />
									<p className="text-white/40 text-sm">
										No past conversations yet
									</p>
								</>
							)}
						</div>
					) : (
						displayed.map((conv) => (
							<button
								key={conv.conversation_id}
								onClick={() =>
									router.push(
										`/admin/conversations/${conv.conversation_id}`,
									)
								}
								className="w-full text-left rounded-2xl bg-white/5 border border-white/10 hover:border-[#C46843]/40 hover:bg-white/8 transition-all p-4 group"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											{conv.status === "in-progress" ? (
												<span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/30">
													<span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
													Live
												</span>
											) : (
												<span className="text-[10px] font-bold uppercase tracking-wider text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
													{conv.status}
												</span>
											)}
											{conv.is_takeover && (
												<span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#1C2D3B] bg-[#C46843] px-2 py-0.5 rounded-full animate-pulse shadow-[0_0_10px_rgba(196,104,67,0.5)]">
													Handover Requested
												</span>
											)}
										</div>
										<p className="text-white/70 text-xs font-mono truncate">
											{conv.conversation_id}
										</p>
										{conv.transcript_summary ? (
											<p className="text-white/40 text-xs mt-1 line-clamp-2 leading-relaxed">
												{conv.transcript_summary}
											</p>
										) : null}
									</div>
									<div className="flex flex-col items-end gap-2 shrink-0">
										<div className="flex items-center gap-1 text-white/30 text-xs">
											<PhoneIcon className="h-3 w-3" />
											{formatDuration(conv.duration_secs)}
										</div>
										{conv.start_time ? (
											<span className="text-white/25 text-[10px]">
												{formatTime(conv.start_time)}
											</span>
										) : null}
										<ArrowRightIcon className="h-4 w-4 text-white/20 group-hover:text-[#C46843] transition-colors mt-1" />
									</div>
								</div>
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
}
