const express = require("express");

const app = express();
const port = Number(process.env.PORT || 8102);

app.get("/", (_request, response) => {
	response.json({ Hello: "World" });
});

app.get("/slow_endpoint", (_request, response) => {
	const deadline = Date.now() + 100;
	while (Date.now() < deadline) {}
	response.json({ message: "This was a slow request" });
});

app.get("/slow_endpoint_fixed", (_request, response) => {
	setTimeout(() => {
		response.json({
			message: "This was a asyncio sleep and now the request is no longer slow",
		});
	}, 100);
});

app.listen(port, "127.0.0.1");
