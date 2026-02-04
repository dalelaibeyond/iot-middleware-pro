// Test script to verify API connection
const axios = require("axios");

async function testApiConnection() {
  try {
    console.log("Testing API connection...");

    // Test the devices endpoint
    const devicesResponse = await axios.get(
      "http://localhost:3000/api/devices",
    );
    console.log("✅ Devices endpoint working:", devicesResponse.status);
    console.log("   Devices found:", devicesResponse.data.length);

    // Test the health endpoint
    const healthResponse = await axios.get("http://localhost:3000/api/health");
    console.log("✅ Health endpoint working:", healthResponse.status);
    console.log("   Middleware status:", healthResponse.data.status);

    // Test the dashboard proxy
    const dashboardResponse = await axios.get(
      "http://localhost:5173/api/devices",
    );
    console.log("✅ Dashboard proxy working:", dashboardResponse.status);
    console.log("   Devices found:", dashboardResponse.data.length);

    console.log("\n🎉 All API connections are working correctly!");
  } catch (error) {
    console.error("❌ API connection failed:", error.message);
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", error.response.data);
    }
  }
}

testApiConnection();
