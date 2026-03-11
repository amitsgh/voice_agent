import { db } from "@/lib/db";
import { NextRequest } from "next/server";

// GET /api/admin/message?conversation_id=...&since=ISO_TIMESTAMP
// Returns messages since a given timestamp (polled by patient's chat page)
export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const conversation_id = searchParams.get("conversation_id");
	const since = searchParams.get("since"); // ISO timestamp — only return messages newer than this

	if (!conversation_id) {
		return Response.json({ messages: [] });
	}

	try {
		const result = since
			? await db.query(
					"SELECT id, sender, text, sent_at FROM admin_messages WHERE conversation_id = $1 AND sent_at > $2 ORDER BY sent_at ASC",
					[conversation_id, since],
				)
			: await db.query(
					"SELECT id, sender, text, sent_at FROM admin_messages WHERE conversation_id = $1 ORDER BY sent_at ASC",
					[conversation_id],
				);

		return Response.json({ messages: result.rows });
	} catch (err: any) {
		console.error("[admin/message] GET error:", err?.message);
		return Response.json({ messages: [] });
	}
}

// POST /api/admin/message
// Body: { conversation_id, text, sender? }
export async function POST(request: NextRequest) {
	try {
		const { conversation_id, text, sender = "John" } = await request.json();
		if (!conversation_id || !text?.trim()) {
			return Response.json({ error: "conversation_id and text required" }, { status: 400 });
		}

		const result = await db.query(
			"INSERT INTO admin_messages (conversation_id, sender, text, sent_at) VALUES ($1, $2, $3, NOW()) RETURNING id, sent_at",
			[conversation_id, sender, text.trim()],
		);

		return Response.json({ ok: true, message: result.rows[0] });
	} catch (err: any) {
		console.error("[admin/message] POST error:", err?.message);
		return Response.json({ error: "DB error" }, { status: 500 });
	}
}
