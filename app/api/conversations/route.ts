import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("user_id");
		const mode = searchParams.get("mode") || "transcript";

		const k = Math.min(parseInt(searchParams.get("k") ?? "3", 10), 10);

		console.log(
			`[conversations] Fetching mode=${mode}, k=${k} for userId=${userId}`,
		);

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

		if (mode === "summary") {
			return Response.json({ summaries });
		}

		const transcriptK = Math.min(k, 3);
		const conversationsToFetch = conversations.slice(0, transcriptK);

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

		// Process transcripts and insert separators between conversations
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

			if (filtered.length > 0) {
				// If we already have messages, add a separator before the next conversation block
				if (allMessages.length > 0) {
					allMessages.push({
						role: "separator",
						message: "Previous Conversation",
					});
				}
				allMessages.push(...filtered);
			}
		});

		const hasUserMessage = allMessages.some((m: any) => m.role === "user");

		return Response.json({
			messages: hasUserMessage ? allMessages : [],
			summaries: summaries,
			conversationCount: conversations.length,
		});
	} catch (error: any) {
		console.error("[/api/conversations] Error:", error?.message ?? error);
		return Response.json({ messages: [], summaries: [] });
	}
}
