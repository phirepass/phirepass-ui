export async function json_response(data: unknown, status: number = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

export async function empty_response(status: number = 204, headers?: HeadersInit) {
    return new Response(null, {
        status,
        headers,
    });
}
