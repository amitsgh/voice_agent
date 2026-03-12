// POST /api/conversations/message
// Called by the patient's chat page to persist every live message in real-time
// so the admin transcript stays up to date during an active session.
//
// Uses the admin_messages table with a `source` column to distinguish:
//   source='ai'      → Hannah's AI responses
//   source='patient' → patient's typed messages
//   source='human'   → human agent (John) messages (existing behaviour, unchanged)

import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { conversation_id, role, message } = body;

		if (!conversation_id || !role || !message?.trim()) {
			return Response.json(
				{ error: "conversation_id, role and message are required" },
				{ status: 400 },
			);
		}

		// Map role to sender + source to fit the admin_messages schema
		// role='assistant' → sender='assistant', source='ai'
		// role='user'      → sender='patient',   source='patient'
		const isUser = role === "user" || role === "patient";
		const sender = isUser ? "patient" : "assistant";
		const source = isUser ? "patient" : "ai";

		await db.query(
			`INSERT INTO admin_messages (conversation_id, sender, text, source, sent_at)
       VALUES ($1, $2, $3, $4, NOW())`,
			[conversation_id, sender, message.trim(), source],
		);

		return Response.json({ ok: true });
	} catch (err: any) {
		console.error("[POST /api/conversations/message] error:", err?.message);
		return Response.json({ error: "DB error" }, { status: 500 });
	}
}
