const Fastify = require("fastify");

const app = Fastify();
const port = Number(process.env.PORT || 8103);

app.get("/", async () => ({ Hello: "World" }));

app.get("/slow_endpoint", async () => {
	const deadline = Date.now() + 100;
	while (Date.now() < deadline) {}
	return { message: "This was a slow request" };
});

app.get("/slow_endpoint_fixed", async () => {
	await new Promise((resolve) => setTimeout(resolve, 100));
	return {
		message: "This was a asyncio sleep and now the request is no longer slow",
	};
});

app.listen({ port, host: "127.0.0.1" });
