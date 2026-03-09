import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get("user_id");

		// k controls how many past conversations to merge (default: 1, max: 10)
		const k = Math.min(parseInt(searchParams.get("k") ?? "1", 10), 10);

		console.log(
			`[conversations] Fetching k=${k} convs for userId=${userId}`,
		);

		const result = await client.conversationalAi.conversations.list({
			agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!,
			userId: userId ?? undefined,
			pageSize: k,
		});

		const conversations = result.conversations ?? [];
		console.log(
			`[conversations] Found ${conversations.length} conversations`,
			conversations.map((c) => ({
				id: c.conversationId,
				status: c.status,
				msgs: c.messageCount,
			})),
		);

		if (conversations.length === 0) {
			return Response.json({ messages: [] });
		}

		// Fetch transcripts for all k conversations in parallel
		const transcripts = await Promise.all(
			conversations.map((conv) =>
				client.conversationalAi.conversations
					.get(conv.conversationId)
					.then((detail) => {
						console.log(
							`[conversations] conv ${conv.conversationId}: ${detail.transcript?.length ?? 0} messages`,
							detail.transcript?.map((m: any) => ({
								role: m.role,
								msg: m.message?.slice(0, 40),
							})),
						);
						return detail.transcript ?? [];
					})
					.catch((err) => {
						console.error(
							`[conversations] Failed to fetch conv ${conv.conversationId}:`,
							err?.message,
						);
						return [];
					}),
			),
		);

		// Conversations come back newest-first — reverse so oldest is first
		// then flatten into a single chronological message list
		const allMessages = transcripts
			.reverse()
			.flat()
			.filter(
				(m: any) =>
					m.role === "user" ||
					m.role === "agent" ||
					m.role === "assistant",
			);

		console.log(
			`[conversations] allMessages count: ${allMessages.length}, roles: `,
			[...new Set(allMessages.map((m: any) => m.role))],
		);

		const hasUserMessage = allMessages.some((m: any) => m.role === "user");
		console.log(`[conversations] hasUserMessage: ${hasUserMessage}`);

		if (!hasUserMessage) {
			return Response.json({ messages: [] });
		}

		return Response.json({
			messages: allMessages,
			conversationCount: conversations.length,
		});
	} catch (error: any) {
		console.error("[/api/conversations] Error:", error?.message ?? error);
		return Response.json({ messages: [] });
	}
}
