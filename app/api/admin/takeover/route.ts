import { db } from "@/lib/db";
import { NextRequest } from "next/server";

// GET /api/admin/takeover?conversation_id=...
// Returns current takeover state for a conversation (polled by patient's chat page)
export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const conversation_id = searchParams.get("conversation_id");

	if (!conversation_id) {
		return Response.json({ is_active: false });
	}

	try {
		const result = await db.query(
			"SELECT is_active, resolved, updated_at FROM admin_takeovers WHERE conversation_id = $1",
			[conversation_id],
		);
		const row = result.rows[0];
		return Response.json({
			is_active: row?.is_active ?? false,
			resolved: row?.resolved ?? false,
			updated_at: row?.updated_at ?? null,
		});
	} catch (err: any) {
		console.error("[admin/takeover] GET error:", err?.message);
		return Response.json({ is_active: false });
	}
}

// POST /api/admin/takeover
// Body: { conversation_id, is_active: true|false }
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { conversation_id, is_active } = body;
		const resolved = body.resolved ?? false;

		if (!conversation_id) {
			return Response.json({ error: "conversation_id required" }, { status: 400 });
		}

		await db.query(
			`INSERT INTO admin_takeovers (conversation_id, is_active, resolved, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (conversation_id)
       DO UPDATE SET is_active = $2, resolved = $3, updated_at = NOW()`,
			[conversation_id, is_active, resolved],
		);

		return Response.json({ ok: true, is_active, resolved });
	} catch (err: any) {
		console.error("[admin/takeover] POST error:", err?.message);
		return Response.json({ error: "DB error" }, { status: 500 });
	}
}
