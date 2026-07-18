import { redirect } from "next/navigation";
import { verifyToken } from "@/app/lib/auth";
import Login from "@/pages/Login";

export default async function LoginPage() {
    let authenticated: boolean;

    try {
        await verifyToken();
        authenticated = true;
    } catch {
        authenticated = false;
    }

    if (authenticated) {
        redirect("/dashboard/nodes");
    }

    return <Login />;
}
