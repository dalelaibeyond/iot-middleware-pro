/**
 * Device Simulation Script
 * 
 * Simulates V5008 and V6800 devices publishing to MQTT broker.
 * Run this script while the middleware and dashboard are running.
 * 
 * Usage: node scripts/simulate_devices.js
 */

const mqtt = require('mqtt');

// Configuration
const MQTT_BROKER = 'mqtt://localhost:1883';

// Device IDs
const V5008_DEVICE_ID = 'SIM_V5_01';
const V6800_DEVICE_ID = 'SIM_V6_01';

// Counter for message IDs
let msgIdCounter = 1;

// ===== State Tracking =====
const state = {
    v5008: {
        doorOpen: false,
        tagsPresent: new Set([3, 7, 12]),
        moduleId: 3963041727
    },
    v6800: {
        door1Open: false,
        door2Open: false,
        tagsPresent: new Set([2, 5, 9, 11])
    }
};

// Tag pool
const TAG_POOL = [
    'E200341502001080', 'E200341502001081', 'E200341502001082',
    'E200341502001083', 'E200341502001084', 'E200341502001085',
    'E200341502001086', 'E200341502001087', 'E200341502001088',
    'E200341502001089', 'E20034150200108A', 'E20034150200108B'
];

// Device info constants (for SmartHeartbeat)
const DEVICE_INFO = {
    v5008: {
        ip: [192, 168, 1, 100],
        mask: [255, 255, 255, 0],
        gw: [192, 168, 1, 1],
        mac: [0x08, 0x80, 0x7D, 0x79, 0x4B, 0x45],
        fwVer: 0x02000001, // 2.0.0.1
        model: 0x5008
    },
    v6800: {
        ip: '192.168.1.101',
        mask: '255.255.255.0',
        gw: '192.168.1.1',
        mac: '08:80:7D:79:4B:46',
        fwVer: '2.0.0.1'
    }
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getNextMsgId() {
    return msgIdCounter++;
}

function randomTempBytes() {
    const temp = randomInt(1800, 3500) / 100;
    const isNegative = temp < 0;
    const absTemp = Math.abs(temp);
    const intPart = Math.floor(absTemp);
    const fracPart = Math.round((absTemp - intPart) * 100);
    return { int: isNegative ? (0xFF - intPart + 1) | 0x80 : intPart, frac: fracPart };
}

function randomHumBytes() {
    const hum = randomInt(3000, 8000) / 100;
    const intPart = Math.floor(hum);
    const fracPart = Math.round((hum - intPart) * 100);
    return { int: intPart, frac: fracPart };
}

function randomNoiseBytes() {
    const noise = randomInt(3500, 7500) / 100;
    const intPart = Math.floor(noise);
    const fracPart = Math.round((noise - intPart) * 100);
    return { int: intPart, frac: fracPart };
}

// ===== V5008 Binary Messages =====

function createV5008Heartbeat() {
    const msgId = getNextMsgId();
    const buf = Buffer.alloc(1 + 10 * 6 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xCC, offset++);
    for (let i = 0; i < 10; i++) {
        if (i === 0) {
            buf.writeUInt8(1, offset++);
            buf.writeUInt32BE(state.v5008.moduleId, offset);
            offset += 4;
            buf.writeUInt8(12, offset++);
        } else {
            buf.writeUInt8(i + 1, offset++);
            buf.writeUInt32BE(0, offset);
            offset += 4;
            buf.writeUInt8(0, offset++);
        }
    }
    buf.writeUInt32BE(msgId, offset);
    return buf;
}

function createV5008TempHum() {
    const msgId = getNextMsgId();
    const buf = Buffer.alloc(1 + 4 + 6 * 5 + 4);
    let offset = 0;
    
    buf.writeUInt8(1, offset++);
    buf.writeUInt32BE(state.v5008.moduleId, offset);
    offset += 4;
    
    for (let i = 0; i < 6; i++) {
        const temp = randomTempBytes();
        const hum = randomHumBytes();
        buf.writeUInt8(10 + i, offset++);
        buf.writeUInt8(temp.int, offset++);
        buf.writeUInt8(temp.frac, offset++);
        buf.writeUInt8(hum.int, offset++);
        buf.writeUInt8(hum.frac, offset++);
    }
    buf.writeUInt32BE(msgId, offset);
    return buf;
}

function createV5008Noise() {
    const msgId = getNextMsgId();
    const buf = Buffer.alloc(1 + 4 + 3 * 3 + 4);
    let offset = 0;
    
    buf.writeUInt8(1, offset++);
    buf.writeUInt32BE(state.v5008.moduleId, offset);
    offset += 4;
    
    for (let i = 0; i < 3; i++) {
        const noise = randomNoiseBytes();
        buf.writeUInt8(16 + i, offset++);
        buf.writeUInt8(noise.int, offset++);
        buf.writeUInt8(noise.frac, offset++);
    }
    buf.writeUInt32BE(msgId, offset);
    return buf;
}

function createV5008Door() {
    const msgId = getNextMsgId();
    state.v5008.doorOpen = !state.v5008.doorOpen;
    
    const buf = Buffer.alloc(1 + 1 + 4 + 1 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xBA, offset++);
    buf.writeUInt8(1, offset++);
    buf.writeUInt32BE(state.v5008.moduleId, offset);
    offset += 4;
    buf.writeUInt8(state.v5008.doorOpen ? 1 : 0, offset++);
    buf.writeUInt32BE(msgId, offset);
    
    return { buffer: buf, isOpen: state.v5008.doorOpen };
}

function createV5008RfidSnapshot() {
    const msgId = getNextMsgId();
    const tags = Array.from(state.v5008.tagsPresent).sort((a, b) => a - b);
    const count = tags.length;
    
    const buf = Buffer.alloc(1 + 1 + 4 + 1 + 1 + 1 + count * 6 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xBB, offset++);
    buf.writeUInt8(1, offset++);
    buf.writeUInt32BE(state.v5008.moduleId, offset);
    offset += 4;
    buf.writeUInt8(0, offset++);
    buf.writeUInt8(12, offset++);
    buf.writeUInt8(count, offset++);
    
    for (let i = 0; i < count; i++) {
        buf.writeUInt8(tags[i], offset++);
        buf.writeUInt8(0, offset++);
        const tagId = Buffer.from(TAG_POOL[i % TAG_POOL.length].slice(0, 8), 'hex');
        tagId.copy(buf, offset);
        offset += 4;
    }
    buf.writeUInt32BE(msgId, offset);
    return buf;
}

function createV5008RfidEvent() {
    const tags = Array.from(state.v5008.tagsPresent);
    const action = tags.length > 0 && Math.random() > 0.5 ? 'DETACH' : 'ATTACH';
    
    let uPos;
    if (action === 'ATTACH') {
        const available = [];
        for (let i = 1; i <= 12; i++) if (!state.v5008.tagsPresent.has(i)) available.push(i);
        if (available.length === 0) return null;
        uPos = available[randomInt(0, available.length - 1)];
        state.v5008.tagsPresent.add(uPos);
    } else {
        uPos = tags[randomInt(0, tags.length - 1)];
        state.v5008.tagsPresent.delete(uPos);
    }
    
    return { 
        buffer: createV5008RfidSnapshot(), 
        action, 
        uPos,
        topic: `V5008Upload/${V5008_DEVICE_ID}/LabelState`
    };
}

function createV5008DeviceInfo() {
    const msgId = getNextMsgId();
    // Schema: Header(0xEF01) + Model(2) + Fw(4) + IP(4) + Mask(4) + Gw(4) + Mac(6) + MsgId(4)
    const buf = Buffer.alloc(2 + 2 + 4 + 4 + 4 + 4 + 6 + 4);
    let offset = 0;
    
    buf.writeUInt16BE(0xEF01, offset); offset += 2; // Header
    buf.writeUInt16BE(DEVICE_INFO.v5008.model, offset); offset += 2; // Model
    buf.writeUInt32BE(DEVICE_INFO.v5008.fwVer, offset); offset += 4; // Firmware
    buf.writeUInt8(DEVICE_INFO.v5008.ip[0], offset++); // IP
    buf.writeUInt8(DEVICE_INFO.v5008.ip[1], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.ip[2], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.ip[3], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.mask[0], offset++); // Mask
    buf.writeUInt8(DEVICE_INFO.v5008.mask[1], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.mask[2], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.mask[3], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.gw[0], offset++); // Gateway
    buf.writeUInt8(DEVICE_INFO.v5008.gw[1], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.gw[2], offset++);
    buf.writeUInt8(DEVICE_INFO.v5008.gw[3], offset++);
    DEVICE_INFO.v5008.mac.forEach(b => buf.writeUInt8(b, offset++)); // MAC
    buf.writeUInt32BE(msgId, offset); // MsgId
    
    return buf;
}

function createV5008ModuleInfo() {
    const msgId = getNextMsgId();
    // Schema: Header(0xEF02) + [ModAddr(1) + Fw(4)] × N + MsgId(4)
    // N = 1 (one module)
    const buf = Buffer.alloc(2 + 1 + 4 + 4);
    let offset = 0;
    
    buf.writeUInt16BE(0xEF02, offset); offset += 2; // Header
    buf.writeUInt8(1, offset++); // ModAddr
    buf.writeUInt32BE(DEVICE_INFO.v5008.fwVer, offset); offset += 4; // FwVer
    buf.writeUInt32BE(msgId, offset); // MsgId
    
    return buf;
}

// ===== V6800 JSON Messages =====

function createV6800Heartbeat() {
    return JSON.stringify({
        msg_type: 'heart_beat_req',
        gateway_sn: V6800_DEVICE_ID,
        uuid_number: getNextMsgId(),
        data: [{ module_index: 1, module_sn: '6800000001', module_u_num: 12 }]
    });
}

function createV6800TempHum() {
    return JSON.stringify({
        msg_type: 'temper_humidity_exception_nofity_req',
        gateway_sn: V6800_DEVICE_ID,
        uuid_number: getNextMsgId(),
        data: [{
            module_index: 1,
            data: [{
                temper_position: 10,
                temper_swot: randomInt(2000, 3500) / 100,
                hygrometer_swot: randomInt(4000, 7000) / 100
            }]
        }]
    });
}

function createV6800Door(singleDoor = true) {
    const msgId = getNextMsgId();
    
    if (singleDoor) {
        // Single door
        state.v6800.door1Open = !state.v6800.door1Open;
        return {
            payload: JSON.stringify({
                msg_type: 'door_state_changed_notify_req',
                gateway_sn: V6800_DEVICE_ID,
                uuid_number: msgId,
                data: [{ 
                    module_index: 1,
                    module_sn: '6800000001',
                    new_state: state.v6800.door1Open ? 1 : 0 
                }]
            }),
            isOpen: state.v6800.door1Open,
            doorNum: 1
        };
    } else {
        // Dual door - toggle independently
        const toggleDoor1 = Math.random() > 0.5;
        if (toggleDoor1) {
            state.v6800.door1Open = !state.v6800.door1Open;
        } else {
            state.v6800.door2Open = !state.v6800.door2Open;
        }
        return {
            payload: JSON.stringify({
                msg_type: 'door_state_changed_notify_req',
                gateway_sn: V6800_DEVICE_ID,
                uuid_number: msgId,
                data: [{
                    module_index: 1,
                    module_sn: '6800000001',
                    new_state1: state.v6800.door1Open ? 1 : 0,
                    new_state2: state.v6800.door2Open ? 1 : 0
                }]
            }),
            door1Open: state.v6800.door1Open,
            door2Open: state.v6800.door2Open,
            isDual: true
        };
    }
}

function createV6800RfidSnapshot() {
    const items = Array.from(state.v6800.tagsPresent).map((uPos, idx) => ({
        u_index: uPos,
        tag_code: TAG_POOL[idx % TAG_POOL.length],
        warning: 0
    }));
    
    return JSON.stringify({
        msg_type: 'u_state_resp',
        gateway_sn: V6800_DEVICE_ID,
        uuid_number: getNextMsgId(),
        data: [{
            module_index: 1,
            extend_module_sn: '6800000001',
            data: items
        }]
    });
}

function createV6800RfidEvent() {
    const tags = Array.from(state.v6800.tagsPresent);
    const action = tags.length > 0 && Math.random() > 0.5 ? 'DETACH' : 'ATTACH';
    
    let uPos, oldState, newState;
    if (action === 'ATTACH') {
        const available = [];
        for (let i = 1; i <= 12; i++) if (!state.v6800.tagsPresent.has(i)) available.push(i);
        if (available.length === 0) return null;
        uPos = available[randomInt(0, available.length - 1)];
        state.v6800.tagsPresent.add(uPos);
        oldState = 0;
        newState = 1;
    } else {
        uPos = tags[randomInt(0, tags.length - 1)];
        state.v6800.tagsPresent.delete(uPos);
        oldState = 1;
        newState = 0;
    }
    
    const tagIndex = action === 'ATTACH' ? state.v6800.tagsPresent.size - 1 : state.v6800.tagsPresent.size;
    
    return {
        payload: JSON.stringify({
            msg_type: 'u_state_changed_notify_req',
            gateway_sn: V6800_DEVICE_ID,
            uuid_number: getNextMsgId(),
            data: [{
                host_gateway_port_index: 1,
                data: [{
                    u_index: uPos,
                    tag_code: TAG_POOL[tagIndex % TAG_POOL.length],
                    new_state: newState,
                    old_state: oldState,
                    warning: 0
                }]
            }]
        }),
        action,
        uPos
    };
}

function createV6800DevModInfo() {
    return JSON.stringify({
        msg_type: 'devies_init_req',
        gateway_sn: V6800_DEVICE_ID,
        uuid_number: getNextMsgId(),
        gateway_ip: DEVICE_INFO.v6800.ip,
        gateway_mac: DEVICE_INFO.v6800.mac,
        gateway_mask: DEVICE_INFO.v6800.mask,
        gateway_gw: DEVICE_INFO.v6800.gw,
        data: [{
            module_index: 1,
            module_sn: '6800000001',
            module_sw_version: DEVICE_INFO.v6800.fwVer,
            module_u_num: 12
        }]
    });
}

// ===== Scheduler Helper =====

function schedulePublish(client, intervalMs, publishFn, label) {
    const run = () => {
        const result = publishFn();
        
        // Skip if no result (e.g., RFID slots full/empty)
        if (!result) {
            setTimeout(run, intervalMs());
            return;
        }
        
        // Publish based on result type
        if (result.topic && result.payload !== undefined) {
            client.publish(result.topic, result.payload);
        } else if (result.topic && result.buffer !== undefined) {
            client.publish(result.topic, result.buffer);
        } else if (result.payload !== undefined) {
            // V6800 door with default topic
            client.publish(`V6800Upload/${V6800_DEVICE_ID}/door_state_changed_notify_req`, result.payload);
        } else {
            console.error(`[ERROR] Unknown publish format for ${label}:`, result);
            setTimeout(run, intervalMs());
            return;
        }
        
        // Log the event
        const timestamp = new Date().toISOString();
        if (label.includes('DOOR')) {
            if (label.includes('V6800')) {
                console.log(`[${timestamp}] V6800 DUAL DOOR → Door1:${result.door1Open ? 'OPEN' : 'CLOSED'} Door2:${result.door2Open ? 'OPEN' : 'CLOSED'} 🔓🔒`);
            } else {
                console.log(`[${timestamp}] ${label} → ${result.isOpen ? 'OPEN 🔓' : 'CLOSED 🔒'}`);
            }
        } else if (label.includes('RFID EVENT')) {
            console.log(`[${timestamp}] ${label} → ${result.action} at #${result.uPos} ${result.action === 'ATTACH' ? '📎' : '👋'}`);
        } else if (label.includes('SNAPSHOT')) {
            const tags = label.includes('V5008') 
                ? Array.from(state.v5008.tagsPresent).sort((a, b) => a - b)
                : Array.from(state.v6800.tagsPresent).sort((a, b) => a - b);
            console.log(`[${timestamp}] ${label} → Tags at [${tags.join(', ')}] 📋`);
        } else {
            console.log(`[${timestamp}] ${label}`);
        }
        
        setTimeout(run, intervalMs());
    };
    run();
}

// ===== Main =====

async function main() {
    console.log('========================================');
    console.log('  IoT Device Simulator v2');
    console.log('========================================');
    console.log(`MQTT Broker: ${MQTT_BROKER}`);
    
    const client = mqtt.connect(MQTT_BROKER, {
        clientId: `device-simulator-${Date.now()}`,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 5000
    });
    
    client.on('connect', () => {
        console.log('✅ Connected to MQTT broker\n');
        
        console.log('Device Configuration:');
        console.log(`  SIM_V5_01: Zones #10-15 (temp), #16-18 (noise), Single Door`);
        console.log(`  SIM_V6_01: Zone #10 (temp), Dual Door\n`);
        
        console.log('Publishing Schedule:');
        console.log('  • Telemetry (Temp/Hum/Noise/Heartbeat): Every 5s');
        console.log('  • Door State: Every 12s');
        console.log('  • RFID Events: Every 10s');
        console.log('  • RFID Snapshots: Every 30s');
        console.log('  • Device/Module Info: Immediately + every 60s (prevents SmartHeartbeat queries)\n');
        
        console.log('Press Ctrl+C to stop');
        console.log('----------------------------------------\n');
        
        // === V5008 Schedulers ===
        
        // Telemetry every 5s
        setInterval(() => {
            const ts = new Date().toISOString();
            client.publish(`V5008Upload/${V5008_DEVICE_ID}/OpeAck`, createV5008Heartbeat());
            client.publish(`V5008Upload/${V5008_DEVICE_ID}/TemHum`, createV5008TempHum());
            client.publish(`V5008Upload/${V5008_DEVICE_ID}/Noise`, createV5008Noise());
            console.log(`[${ts}] V5008 HEARTBEAT + TEMP_HUM (#10-15) + NOISE (#16-18)`);
        }, 5000);
        
        // Door every 12s
        schedulePublish(client, () => 12000, () => {
            return { ...createV5008Door(), topic: `V5008Upload/${V5008_DEVICE_ID}/Door` };
        }, 'V5008 DOOR');
        
        // RFID Event every 10s
        schedulePublish(client, () => 10000, createV5008RfidEvent, 'V5008 RFID EVENT');
        
        // RFID Snapshot every 30s
        schedulePublish(client, () => 30000, () => {
            return { 
                topic: `V5008Upload/${V5008_DEVICE_ID}/LabelState`, 
                buffer: createV5008RfidSnapshot() 
            };
        }, 'V5008 RFID SNAPSHOT');
        
        // Device Info: Send immediately, then every 60s
        const sendV5008DeviceInfo = () => {
            const ts = new Date().toISOString();
            const deviceInfo = createV5008DeviceInfo();
            const moduleInfo = createV5008ModuleInfo();
            client.publish(`V5008Upload/${V5008_DEVICE_ID}/DeviceInfo`, deviceInfo);
            client.publish(`V5008Upload/${V5008_DEVICE_ID}/ModuleInfo`, moduleInfo);
            console.log(`[${ts}] V5008 DEVICE_INFO + MODULE_INFO sent (hex: ${deviceInfo.toString('hex').substring(0, 20)}...)`);
        };
        sendV5008DeviceInfo(); // Send immediately
        setInterval(sendV5008DeviceInfo, 60000); // Then every 60s
        
        // === V6800 Schedulers ===
        
        // Telemetry every 5s
        setInterval(() => {
            const ts = new Date().toISOString();
            client.publish(`V6800Upload/${V6800_DEVICE_ID}/heart_beat_req`, createV6800Heartbeat());
            client.publish(`V6800Upload/${V6800_DEVICE_ID}/temper_humidity_exception_nofity_req`, createV6800TempHum());
            console.log(`[${ts}] V6800 HEARTBEAT + TEMP_HUM (#10)`);
        }, 5000);
        
        // Door every 12s (always dual door for consistent display)
        schedulePublish(client, () => 12000, () => {
            return createV6800Door(false); // false = dual door
        }, 'V6800 DOOR');
        
        // RFID Event every 10s
        schedulePublish(client, () => 10000, createV6800RfidEvent, 'V6800 RFID EVENT');
        
        // RFID Snapshot every 30s
        schedulePublish(client, () => 30000, () => {
            return { 
                topic: `V6800Upload/${V6800_DEVICE_ID}/u_state_resp`, 
                payload: createV6800RfidSnapshot() 
            };
        }, 'V6800 RFID SNAPSHOT');
        
        // Device Info: Send immediately, then every 60s
        const sendV6800DeviceInfo = () => {
            const ts = new Date().toISOString();
            const devModInfo = createV6800DevModInfo();
            client.publish(`V6800Upload/${V6800_DEVICE_ID}/devies_init_req`, devModInfo);
            console.log(`[${ts}] V6800 DEV_MOD_INFO sent: ${devModInfo.substring(0, 80)}...`);
        };
        sendV6800DeviceInfo(); // Send immediately
        setInterval(sendV6800DeviceInfo, 60000); // Then every 60s
    });
    
    client.on('error', (err) => {
        console.error('❌ MQTT Error:', err.message);
        process.exit(1);
    });
    
    process.on('SIGINT', () => {
        console.log('\n----------------------------------------');
        console.log('Shutting down simulator...');
        client.end(true, () => {
            console.log('✅ Disconnected');
            process.exit(0);
        });
    });
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
