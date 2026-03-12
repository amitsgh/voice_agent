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

		const transcripts = await Promise.all(
			conversationsToFetch.map((conv) =>
				client.conversationalAi.conversations
					.get(conv.conversationId)
					.then((detail) => detail.transcript ?? [])
					.catch((err) => {
						console.error(
							`[conversations] Failed to fetch conv ${conv.conversationId}:`,
							err?.message,
						);
						return [];
					}),
			),
		);

		const allMessages: any[] = [];
		const reversedTranscripts = transcripts.reverse();

		reversedTranscripts.forEach((transcript, index) => {
			const filtered = transcript
				.filter((m: any) => {
					const hasText = (m.message || m.text)?.trim();
					return (
						(m.role === "user" ||
							m.role === "agent" ||
							m.role === "assistant") &&
						hasText &&
						hasText !== "..."
					);
				})
				.map((m: any) => ({
					role: m.role === "agent" ? "assistant" : m.role,
					message: m.message || m.text,
				}));

			const hasUserTurn = filtered.some((m) => m.role === "user");
			if (filtered.length > 0 && hasUserTurn) {
				if (allMessages.length > 0) {
					allMessages.push({
						role: "separator",
						message: "Previous Conversation",
					});
				}
				allMessages.push(...filtered);
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
