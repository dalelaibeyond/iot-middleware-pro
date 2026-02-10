// verify_pipeline.js
const EventBus = require('../src/core/EventBus');
const ParserManager = require('../src/modules/parsers/ParserManager');
const UnifyNormalizer = require('../src/modules/normalizer/UnifyNormalizer');
const StorageService = require('../src/modules/storage/StorageService');

// 1. Mock the Dependencies to avoid needing Real DB/MQTT
console.log("--- 1. Initializing System ---");

// Mock Database (StorageService usually calls this)
const mockKnex = {
    insert: (data) => {
        console.log("   [DB MOCK] Inserting:", JSON.stringify(data).substring(0, 100) + "...");
        return { onConflict: () => ({ merge: () => Promise.resolve() }) }; // Mock Knex chain
    },
    raw: (query) => Promise.resolve()
};
// Inject Mock DB into StorageService (Hack for testing)
StorageService.db = mockKnex; 

// 2. Initialize Modules
// UnifyNormalizer and StorageService are singletons
UnifyNormalizer.initialize({});
StorageService.initialize({ batchIntervalMs: 1000, enabled: true });
StorageService.start(); // Listen to EventBus

// 3. Define Test Input (V5008 Heartbeat Hex)
// CC + 01(Addr) + 3963041727(ID) + 06(Total) + ... MsgID
const v5008Hex = "CC01EC3737BF06028C0909950C0300000000000400000000000500000000000600000000000700000000000800000000000900000000000A0000000000F200168F";
const v5008Buffer = Buffer.from(v5008Hex, 'hex');
const topic = "V5008Upload/2437871205/OpeAck";

console.log("\n--- 2. Injecting V5008 Data ---");

async function runTest() {
    try {
        // A. PARSE
        console.log("   [STEP A] Parsing...");
        const parser = new ParserManager();
        const sif = parser.parse(topic, v5008Buffer);
        
        if (!sif) throw new Error("Parser returned null!");
        console.log("   ✅ SIF Generated:", sif.messageType);

        // B. NORMALIZE
        // (In real app, MqttSubscriber calls this. We call manually for test)
        console.log("   [STEP B] Normalizing...");
        // Manually hook up the flow if not done in app.js yet
        await normalizer.onMqttMessage({ topic, message: v5008Buffer }); 
        // Note: You might need to adjust this call based on how your MqttSubscriber routes data
        // If UnifyNormalizer listens to EventBus 'mqtt.message', emit it:
        EventBus.emit('mqtt.message', { topic, message: v5008Buffer });

        // Wait a moment for async events
        setTimeout(() => {
            console.log("\n--- 3. Verification Results ---");
            console.log("   Did you see [DB MOCK] logs above?");
            console.log("   If yes -> Phases 0-4 are READY.");
            console.log("   If no  -> Check EventBus wiring.");
            process.exit(0);
        }, 1000);

    } catch (err) {
        console.error("❌ TEST FAILED:", err);
    }
}

runTest();