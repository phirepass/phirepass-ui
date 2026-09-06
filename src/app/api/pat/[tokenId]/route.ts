import { authzErrorStatus, ownedScope, requireSession, scopeAt } from "@/app/lib/authz";
import { json_response } from "@/app/lib/framework";
import { query } from "@/app/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ tokenId: string }> },
) {
    try {
        const session = await requireSession();
        const { tokenId } = await params;
        const scope = scopeAt(ownedScope(session, 'tokens:read:all', 'pat_tokens'), 1);

        const result = await query(
            `DELETE FROM pat_tokens
            WHERE token_id = $1 AND ${scope.sql}
            RETURNING id`,
            [tokenId, ...scope.params],
        );

        if (result.rowCount === 0) {
            return json_response({ error: "Token not found" }, 404);
        }

        return json_response({ success: true }, 200);
    } catch (e) {
        console.warn(`[server][delete][${req.url}]`, e);
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
