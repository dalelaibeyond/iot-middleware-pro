const http = require("http");

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/devices",
  method: "GET",
  headers: {
    Origin: "http://localhost:5173",
  },
};

http.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("API Response:", data);
    console.log("Status Code:", res.statusCode);
  });
});

console.log("Testing API connection...");
