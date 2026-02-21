export async function GET() {
    try {
        return new Response(null, { status: 200 });
    } catch {
        return new Response(null, { status: 503 });
    }
}
