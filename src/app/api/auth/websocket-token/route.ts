import { getVerifiedAuthToken } from "@/app/lib/auth";
import { json_response } from "@/app/lib/framework";

export async function GET(req: Request) {
    try {
        const token = await getVerifiedAuthToken();
        return json_response({ token }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        const message = e instanceof Error ? e.message : "Unauthorized";
        const status =
            message === "Token not found" ||
            message === "Invalid token" ||
            message === "Invalid token payload" ||
            message === "User not found"
                ? 401
                : 500;
        return json_response(
            { error: status === 401 ? "Unauthorized" : "Server error" },
            status,
        );
    }
}
