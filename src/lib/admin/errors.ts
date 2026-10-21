/** An error whose message is safe to show the user (run() passes it through). */
export const userError = (message: string, status = 400) => Object.assign(new Error(message), { status });
