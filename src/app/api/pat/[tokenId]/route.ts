import { verifyToken } from "@/app/lib/auth";
import { json_response } from "@/app/lib/framework";
import { query } from "@/app/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ tokenId: string }> },
) {
    try {
        const user = await verifyToken();
        const { tokenId } = await params;

        const result = await query(
            `DELETE FROM pat_tokens
             WHERE token_id = $1 AND user_id = $2
             RETURNING id`,
            [tokenId, user.id],
        );

        if (result.rowCount === 0) {
            return json_response({ error: "Token not found" }, 404);
        }

        return json_response({ success: true }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        return json_response({ error: "Server error" }, 500);
    }
}
