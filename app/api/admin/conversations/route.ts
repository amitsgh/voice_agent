// GET /api/admin/conversations
// Returns a paginated list of all conversations for the admin dashboard.
// Decorates each entry with a flag showing whether a human takeover is active.

import { db } from "@/lib/db";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest } from "next/server";

const client = new ElevenLabsClient({
	apiKey: process.env.ELEVENLABS_API_KEY!,
});

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const status = searchParams.get("status") ?? "all"; // "in-progress" | "done" | "all"
		const pageSize = parseInt(searchParams.get("page_size") ?? "20", 10);

		const listParams: any = {
			agentId: AGENT_ID,
			pageSize,
		};

		const result = await client.conversationalAi.conversations.list(listParams);
		const conversations = result.conversations ?? [];

		// Filter by status on our side when a specific status is requested
		const filtered =
			status === "all"
				? conversations
				: conversations.filter((c) => c.status === status);

		// Fetch active takeovers to decorate the list
		let activeTakeovers = new Set<string>();
		try {
			const takeoverResult = await db.query(
				"SELECT conversation_id FROM admin_takeovers WHERE is_active = true",
			);
			activeTakeovers = new Set(
				takeoverResult.rows.map((r: any) => r.conversation_id),
			);
		} catch (e) {
			console.error("[admin/conversations] Failed to fetch takeovers:", e);
		}

		const items = filtered.map((c) => ({
			conversation_id: c.conversationId,
			status: c.status,
			agent_id: c.agentId,
			start_time: c.startTimeUnixSecs,
			duration_secs: c.callDurationSecs ?? 0,
			transcript_summary: (c as any).transcriptSummary ?? null,
			is_takeover: activeTakeovers.has(c.conversationId),
		}));

		return Response.json({ conversations: items });
	} catch (err: any) {
		console.error("[GET /api/admin/conversations] error:", err?.message);
		return Response.json({ conversations: [] }, { status: 500 });
	}
}
