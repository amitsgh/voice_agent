import { db } from "@/lib/db";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

// console.log("ELEVENLABS_API_KEY", process.env.ELEVENLABS_API_KEY!);

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("user_id");
		const k = parseInt(searchParams.get("k") ?? "3", 10);

		const result = await client.conversationalAi.conversations.list({
			agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
			userId: userId ?? undefined,
			pageSize: k,
			summaryMode: "include",
			callSuccessful: "success",
		});

		const conversations = result.conversations ?? [];

		if (conversations.length === 0) {
			return Response.json({ messages: [], summaries: [] });
		}

		const summaries = conversations
			.filter(
				(c) =>
					(c.status === "done" || c.status === "processing") &&
					(c as any).transcriptSummary,
			)
			.map((c) => ({
				conversation_id: c.conversationId,
				summary: (c as any).transcriptSummary,
				start_time: c.startTimeUnixSecs,
			}));

		const conversationsToFetch = conversations.slice(0, k);

		// Fetch both ElevenLabs transcripts and local DB messages
		const sessionData = await Promise.all(
			conversationsToFetch.map(async (conv) => {
				const startTimeSecs = conv.startTimeUnixSecs;

				// 1. ElevenLabs transcript (might be stale/empty for very recent calls)
				let elMessages: any[] = [];
				try {
					const detail =
						await client.conversationalAi.conversations.get(
							conv.conversationId,
						);
					elMessages = (detail.transcript ?? [])
						.filter((m: any) => {
							const hasText = (m.message || m.text)?.trim();
							return (
								(m.role === "agent" ||
									m.role === "user" ||
									m.role === "assistant") &&
								hasText &&
								hasText !== "..."
							);
						})
						.map((m: any) => ({
							role: m.role === "agent" ? "assistant" : m.role,
							content: m.message || m.text,
							time_in_call_secs: m.timeInCallSecs ?? 0,
							isHuman: false,
						}));
				} catch (err) {
					console.error(
						`[history] failed EL fetch for ${conv.conversationId}`,
					);
				}

				// 2. Local DB messages (The ground truth for real-time turns)
				let dbMessages: any[] = [];
				try {
					const dbRes = await db.query(
						`SELECT text, sender, sent_at, source 
						 FROM admin_messages 
						 WHERE conversation_id = $1 
						 ORDER BY sent_at ASC`,
						[conv.conversationId],
					);
					dbMessages = dbRes.rows.map((row: any) => {
						const isHuman =
							row.source === "human" ||
							(row.source === null &&
								row.sender !== "patient" &&
								row.sender !== "assistant");
						const role =
							row.sender === "patient" ? "user" : "assistant";
						return {
							role,
							content: row.text,
							sender: isHuman
								? (row.sender ?? "John")
								: undefined,
							isHuman,
							time_in_call_secs: Math.max(
								0,
								Math.floor(
									new Date(row.sent_at).getTime() / 1000,
								) - startTimeSecs,
							),
						};
					});
				} catch (err) {
					console.error(
						`[history] failed DB fetch for ${conv.conversationId}`,
					);
				}

				// Merge and deduplicate by content (coarse but effective for history)
				const merged = new Map<string, any>();
				elMessages.forEach((m) => merged.set(m.content.trim(), m));
				dbMessages.forEach((m) => {
					const key = m.content.trim();
					// If DB has it, it might have better metadata (isHuman) or be the only source for live turns
					if (!merged.has(key) || m.isHuman) {
						merged.set(key, m);
					}
				});

				return Array.from(merged.values()).sort(
					(a, b) => a.time_in_call_secs - b.time_in_call_secs,
				);
			}),
		);

		const allMessages: any[] = [];
		const reversedSessionData = sessionData.reverse();

		reversedSessionData.forEach((transcript) => {
			const hasUserTurn = transcript.some((m: any) => m.role === "user");
			if (transcript.length > 0 && hasUserTurn) {
				if (allMessages.length > 0) {
					allMessages.push({
						role: "separator",
						content: "Previous Conversation",
					});
				}
				allMessages.push(...transcript);
			}
		});

		return Response.json({
			messages: allMessages,
			summaries: summaries,
			conversationCount: conversations.length,
		});
	} catch (error: any) {
		console.error("[/api/conversations] Error:", error?.message ?? error);
		return Response.json({ messages: [], summaries: [] });
	}
}
