/**
 * IoT Device Simulator v3 - Demo Edition
 * 
 * Simulates realistic V5008 and V6800 device scenarios for dashboard demos.
 * Features:
 * - Per-module message type configuration via command line
 * - Rich console output with visual indicators
 * - Automatic device registration (Device Info messages)
 * 
 * Usage: node scripts/simulate_devices.js [config1] [config2] ...
 * 
 * Config Format:
 *   v5008/mod#1/all                    - all message types for V5008 module 1
 *   v5008/mod#1/door                   - only door messages
 *   v5008/mod#1/door&rfid              - door + rfid messages
 *   v5008/mod#1/door&rfid&env&noise    - all except heartbeat
 *   v6800/mod#2/rfid&env               - V6800 module 2 with rfid + env
 * 
 * Message Types:
 *   - heartbeat (hb): Heartbeat messages
 *   - door: Door state messages
 *   - rfid: RFID snapshot messages
 *   - env: Temperature/Humidity messages
 *   - noise: Noise level messages (V5008 only)
 *   - all: All of the above
 */

const mqtt = require('mqtt');

// ============================================================================
// COMMAND LINE CONFIGURATION PARSER
// ============================================================================

class SimConfig {
    constructor() {
        // Default: all modules, all message types
        this.modules = new Map(); // Key: "v5008:1", Value: { door, rfid, env, noise, heartbeat }
        this.parseArgs();
    }

    parseArgs() {
        const args = process.argv.slice(2);
        
        // Filter out help flags
        const validArgs = args.filter(arg => !arg.startsWith('-'));
        
        if (validArgs.length === 0) {
            // Default: enable everything for all modules
            this.enableAll();
            return;
        }

        for (const arg of validArgs) {
            this.parseConfigArg(arg);
        }
        
        // If no valid modules were configured, fall back to all
        if (this.modules.size === 0) {
            console.log('[Config] No valid configurations found, enabling all modules');
            this.enableAll();
        }
    }

    parseConfigArg(arg) {
        // Format: v5008/mod#1/door&rfid or v6800/mod#2/all
        const match = arg.match(/^(v5008|v6800)\/mod#(\d+)\/(.+)$/i);
        if (!match) {
            console.error(`[Config] Invalid format: ${arg}`);
            console.error(`[Config] Expected: v5008/mod#1/all or v6800/mod#2/door&rfid`);
            return;
        }

        const [, deviceType, moduleIndex, typesStr] = match;
        const moduleKey = `${deviceType.toLowerCase()}:${moduleIndex}`;
        
        const types = typesStr.toLowerCase().split('&').map(t => t.trim());
        const config = {
            heartbeat: false,
            door: false,
            rfid: false,
            env: false,
            noise: false
        };

        for (const type of types) {
            switch (type) {
                case 'all':
                    config.heartbeat = true;
                    config.door = true;
                    config.rfid = true;
                    config.env = true;
                    config.noise = true;
                    break;
                case 'hb':
                case 'heartbeat':
                    config.heartbeat = true;
                    break;
                case 'door':
                    config.door = true;
                    break;
                case 'rfid':
                    config.rfid = true;
                    break;
                case 'env':
                case 'temhum':
                case 'temphum':
                    config.env = true;
                    break;
                case 'noise':
                    config.noise = true;
                    break;
                default:
                    console.error(`[Config] Unknown message type: ${type}`);
            }
        }

        this.modules.set(moduleKey, config);
        console.log(`[Config] ${deviceType.toUpperCase()} Mod#${moduleIndex}: ${this.configToString(config)}`);
    }

    enableAll() {
        // Enable all message types for all modules
        for (const deviceType of ['v5008', 'v6800']) {
            const device = DEVICES[deviceType];
            if (device && device.modules) {
                for (const mod of device.modules) {
                    const moduleKey = `${deviceType}:${mod.index}`;
                    this.modules.set(moduleKey, {
                        heartbeat: true,
                        door: true,
                        rfid: true,
                        env: true,
                        noise: true
                    });
                }
            }
        }
        console.log('[Config] Default mode: All modules, all message types enabled');
    }

    configToString(config) {
        const enabled = [];
        if (config.heartbeat) enabled.push('heartbeat');
        if (config.door) enabled.push('door');
        if (config.rfid) enabled.push('rfid');
        if (config.env) enabled.push('env');
        if (config.noise) enabled.push('noise');
        return enabled.join(', ') || 'none';
    }

    isEnabled(deviceType, moduleIndex, messageType) {
        const moduleKey = `${deviceType.toLowerCase()}:${moduleIndex}`;
        const config = this.modules.get(moduleKey);
        if (!config) return false;
        return config[messageType] === true;
    }

    hasAnyEnabled(deviceType, moduleIndex) {
        const moduleKey = `${deviceType.toLowerCase()}:${moduleIndex}`;
        return this.modules.has(moduleKey);
    }

    getEnabledModules(deviceType) {
        const modules = [];
        for (const [key, config] of this.modules) {
            const [dtype, midx] = key.split(':');
            if (dtype === deviceType.toLowerCase()) {
                modules.push({
                    index: parseInt(midx),
                    config: config
                });
            }
        }
        return modules.sort((a, b) => a.index - b.index);
    }

    printSummary() {
        for (const [key, config] of this.modules) {
            const [deviceType, moduleIndex] = key.split(':');
            console.log(`║  ${deviceType.toUpperCase().padEnd(6)} Mod#${moduleIndex.padEnd(2)} │ ${this.configToString(config).padEnd(42)}║`);
        }
        if (this.modules.size === 0) {
            console.log('║  (No modules configured)                                   ║');
        }
    }
}

// ============================================================================
// DEVICE CONFIGURATION
// ============================================================================

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const SIMULATION_SPEED = parseFloat(process.env.SIM_SPEED) || 1.0; // 1.0 = normal, 2.0 = 2x faster

// Initialize config (will be re-initialized after DEVICES are defined)
let simConfig;

// Device Configurations - Each device has TWO modules
const DEVICES = {
    v5008: {
        id: 'V5008_DEMO_01',
        name: 'Server Room Monitor (V5008)',
        type: 'V5008',
        modules: [
            {   // Module #1 - Original 12U
                index: 1,
                id: 3963041727,
                rackSize: 12,
                name: 'Control Module',
                sensors: {
                    tempHum: { positions: [10, 11, 12], tempRange: [22, 26], humRange: [50, 60] },
                    noise: { positions: [16, 17, 18], range: [35, 50] }
                },
                rfid: { totalSlots: 12, initialTags: [2, 5, 8, 11] }
            },
            {   // Module #2 - New 42U rack
                index: 2,
                id: 3963041728,
                rackSize: 42,
                name: 'Server Rack 42U',
                sensors: {
                    tempHum: { positions: [10, 11, 12], tempRange: [24, 30], humRange: [45, 65] },
                    noise: { positions: [16, 17, 18], range: [40, 60] }
                },
                rfid: { totalSlots: 42, initialTags: [5, 10, 15, 20, 25, 30, 35, 40] }
            }
        ]
    },
    v6800: {
        id: 'V6800_DEMO_01', 
        name: 'Warehouse Gate (V6800)',
        type: 'V6800',
        modules: [
            {   // Module #1 - Entry Control 6U
                index: 1,
                moduleSn: '6800000001',
                rackSize: 6,
                name: 'Entry Control',
                sensors: {
                    tempHum: { position: 10, tempRange: [20, 28], humRange: [45, 65] }
                },
                rfid: { totalSlots: 6, initialTags: [1, 3, 6] },
                dualDoor: false
            },
            {   // Module #2 - New 45U rack
                index: 2,
                moduleSn: '6800000002',
                rackSize: 45,
                name: 'Storage Rack 45U',
                sensors: {
                    tempHum: { position: 10, tempRange: [18, 32], humRange: [40, 75] }
                },
                rfid: { totalSlots: 45, initialTags: [3, 8, 15, 22, 30, 38, 44] },
                dualDoor: true
            }
        ]
    }
};

// Initialize simulation configuration after DEVICES are defined
simConfig = new SimConfig();

// Device Network Info
const DEVICE_NETWORK = {
    v5008: {
        ip: [192, 168, 10, 100],
        mask: [255, 255, 255, 0],
        gw: [192, 168, 10, 1],
        mac: [0x08, 0x80, 0x7D, 0x10, 0x01, 0x00],
        fwVer: 0x02010000,
        model: 0x5008
    },
    v6800: {
        ip: '192.168.10.101',
        mask: '255.255.255.0',
        gw: '192.168.10.1',
        mac: '08:80:7D:10:01:01',
        fwVer: '2.1.0'
    }
};

// Tag database with realistic IDs
const TAG_DATABASE = [
    { id: 'E200341502001001', name: 'Asset-Server-A1', type: 'Server' },
    { id: 'E200341502001002', name: 'Asset-Server-A2', type: 'Server' },
    { id: 'E200341502001003', name: 'Asset-Router-R1', type: 'Network' },
    { id: 'E200341502001004', name: 'Asset-Switch-S1', type: 'Network' },
    { id: 'E200341502001005', name: 'Asset-UPS-U1', type: 'Power' },
    { id: 'E200341502001006', name: 'Asset-PDU-P1', type: 'Power' },
    { id: 'E200341502001007', name: 'Asset-Camera-C1', type: 'Security' },
    { id: 'E200341502001008', name: 'Asset-Camera-C2', type: 'Security' },
    { id: 'E200341502001009', name: 'Asset-Laptop-L1', type: 'IT Equipment' },
    { id: 'E20034150200100A', name: 'Asset-Tablet-T1', type: 'IT Equipment' },
    { id: 'E20034150200100B', name: 'Asset-Phone-P1', type: 'Communication' },
    { id: 'E20034150200100C', name: 'Asset-Printer-P1', type: 'Office' }
];

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class DeviceState {
    constructor() {
        this.msgId = 1;
        // Initialize state for both modules of each device
        this.v5008 = DEVICES.v5008.modules.map(m => ({
            index: m.index,
            doorOpen: false,
            tags: new Set(m.rfid.initialTags),
            temp: m.sensors.tempHum.tempRange[0] + Math.random() * (m.sensors.tempHum.tempRange[1] - m.sensors.tempHum.tempRange[0]),
            hum: m.sensors.tempHum.humRange[0] + Math.random() * (m.sensors.tempHum.humRange[1] - m.sensors.tempHum.humRange[0]),
            noise: m.sensors.noise ? m.sensors.noise.range[0] + Math.random() * (m.sensors.noise.range[1] - m.sensors.noise.range[0]) : 40
        }));
        this.v6800 = DEVICES.v6800.modules.map(m => ({
            index: m.index,
            door1Open: false,
            door2Open: false,
            tags: new Set(m.rfid.initialTags),
            temp: m.sensors.tempHum.tempRange[0] + Math.random() * (m.sensors.tempHum.tempRange[1] - m.sensors.tempHum.tempRange[0]),
            hum: m.sensors.tempHum.humRange[0] + Math.random() * (m.sensors.tempHum.humRange[1] - m.sensors.tempHum.humRange[0])
        }));
    }

    getNextMsgId() {
        return this.msgId++;
    }

    // Environmental drift simulation - for all modules
    driftEnvironment() {
        // V5008: Gradual changes for each module
        this.v5008.forEach(mod => {
            mod.temp += (Math.random() - 0.5) * 0.3;
            mod.hum += (Math.random() - 0.5) * 0.8;
            mod.noise = Math.max(35, Math.min(60, mod.noise + (Math.random() - 0.5) * 2));
            mod.temp = Math.max(18, Math.min(32, mod.temp));
            mod.hum = Math.max(30, Math.min(80, mod.hum));
        });
        
        // V6800: More variable for each module
        this.v6800.forEach(mod => {
            mod.temp += (Math.random() - 0.5) * 0.8;
            mod.hum += (Math.random() - 0.5) * 1.5;
            mod.temp = Math.max(15, Math.min(35, mod.temp));
            mod.hum = Math.max(30, Math.min(85, mod.hum));
        });
    }
}

const state = new DeviceState();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms / SIMULATION_SPEED));
}

function formatTemp(temp) {
    return temp.toFixed(1) + '°C';
}

function formatHum(hum) {
    return hum.toFixed(0) + '%';
}

function formatNoise(noise) {
    return noise.toFixed(1) + 'dB';
}

function getTimestamp() {
    return new Date().toISOString().split('T')[1].split('.')[0];
}

function log(category, message, icon = '') {
    const ts = getTimestamp();
    const color = {
        'V5008': '\x1b[36m', // Cyan
        'V6800': '\x1b[35m', // Magenta
        'SYSTEM': '\x1b[33m', // Yellow
        'EVENT': '\x1b[32m',  // Green
        'WARN': '\x1b[31m'    // Red
    }[category] || '\x1b[0m';
    console.log(`${color}[${ts}] [${category}]\x1b[0m ${icon} ${message}`);
}

// ============================================================================
// V5008 BINARY MESSAGE BUILDERS
// ============================================================================

function buildV5008Heartbeat() {
    // Heartbeat includes all active modules (up to 10)
    const buf = Buffer.alloc(1 + 10 * 6 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xCC, offset++);
    
    // Write module data for all 10 slots
    for (let i = 0; i < 10; i++) {
        const slotNum = i + 1;
        const modConfig = DEVICES.v5008.modules.find(m => m.index === slotNum);
        const modState = state.v5008.find(m => m.index === slotNum);
        
        if (modConfig && modState) {
            // Active module
            buf.writeUInt8(slotNum, offset++);
            buf.writeUInt32BE(modConfig.id, offset);
            offset += 4;
            buf.writeUInt8(modConfig.rfid.totalSlots, offset++);
        } else {
            // Empty slot
            buf.writeUInt8(slotNum, offset++);
            buf.writeUInt32BE(0, offset);
            offset += 4;
            buf.writeUInt8(0, offset++);
        }
    }
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    return buf;
}

function buildV5008TempHum(moduleIndex = 1) {
    const modConfig = DEVICES.v5008.modules.find(m => m.index === moduleIndex);
    const modState = state.v5008.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    const cfg = modConfig.sensors.tempHum;
    const buf = Buffer.alloc(1 + 4 + cfg.positions.length * 5 + 4);
    let offset = 0;
    
    buf.writeUInt8(moduleIndex, offset++);
    buf.writeUInt32BE(modConfig.id, offset);
    offset += 4;
    
    cfg.positions.forEach((pos) => {
        // Simulate slight variations per sensor
        const temp = modState.temp + (Math.random() - 0.5) * 2;
        const hum = modState.hum + (Math.random() - 0.5) * 5;
        
        const tempInt = Math.floor(Math.abs(temp));
        const tempFrac = Math.round((Math.abs(temp) - tempInt) * 100);
        const humInt = Math.floor(hum);
        const humFrac = Math.round((hum - humInt) * 100);
        
        buf.writeUInt8(pos, offset++);
        buf.writeUInt8(temp < 0 ? (0x100 - tempInt) : tempInt, offset++);
        buf.writeUInt8(tempFrac, offset++);
        buf.writeUInt8(humInt, offset++);
        buf.writeUInt8(humFrac, offset++);
    });
    
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    return buf;
}

function buildV5008Noise(moduleIndex = 1) {
    const modConfig = DEVICES.v5008.modules.find(m => m.index === moduleIndex);
    const modState = state.v5008.find(m => m.index === moduleIndex);
    if (!modConfig || !modState || !modConfig.sensors.noise) return null;
    
    const cfg = modConfig.sensors.noise;
    const buf = Buffer.alloc(1 + 4 + cfg.positions.length * 3 + 4);
    let offset = 0;
    
    buf.writeUInt8(moduleIndex, offset++);
    buf.writeUInt32BE(modConfig.id, offset);
    offset += 4;
    
    cfg.positions.forEach(pos => {
        const noise = modState.noise + (Math.random() - 0.5) * 2;
        const intPart = Math.floor(noise);
        const fracPart = Math.round((noise - intPart) * 100);
        
        buf.writeUInt8(pos, offset++);
        buf.writeUInt8(intPart, offset++);
        buf.writeUInt8(fracPart, offset++);
    });
    
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    return buf;
}

function buildV5008Door(moduleIndex = 1) {
    const modConfig = DEVICES.v5008.modules.find(m => m.index === moduleIndex);
    const modState = state.v5008.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    modState.doorOpen = !modState.doorOpen;
    const buf = Buffer.alloc(1 + 1 + 4 + 1 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xBA, offset++);
    buf.writeUInt8(moduleIndex, offset++);
    buf.writeUInt32BE(modConfig.id, offset);
    offset += 4;
    buf.writeUInt8(modState.doorOpen ? 1 : 0, offset++);
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    
    return {
        buffer: buf,
        moduleIndex: moduleIndex,
        state: modState.doorOpen ? 'OPEN 🔓' : 'CLOSED 🔒'
    };
}

function buildV5008RfidSnapshot(moduleIndex = 1) {
    const modConfig = DEVICES.v5008.modules.find(m => m.index === moduleIndex);
    const modState = state.v5008.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    const tags = Array.from(modState.tags).sort((a, b) => a - b);
    const buf = Buffer.alloc(1 + 1 + 4 + 1 + 1 + 1 + tags.length * 6 + 4);
    let offset = 0;
    
    buf.writeUInt8(0xBB, offset++);
    buf.writeUInt8(moduleIndex, offset++);
    buf.writeUInt32BE(modConfig.id, offset);
    offset += 4;
    buf.writeUInt8(0, offset++);
    buf.writeUInt8(modConfig.rfid.totalSlots, offset++);
    buf.writeUInt8(tags.length, offset++);
    
    tags.forEach((uPos) => {
        const tag = TAG_DATABASE[(uPos - 1) % TAG_DATABASE.length];
        buf.writeUInt8(uPos, offset++);
        buf.writeUInt8(0, offset++);
        const tagBytes = Buffer.from(tag.id.slice(0, 8), 'hex');
        tagBytes.copy(buf, offset);
        offset += 4;
    });
    
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    return { buffer: buf, tagCount: tags.length, tags, moduleIndex };
}

function buildV5008DeviceInfo() {
    const net = DEVICE_NETWORK.v5008;
    const buf = Buffer.alloc(2 + 2 + 4 + 4 + 4 + 4 + 6 + 4);
    let offset = 0;
    
    buf.writeUInt16BE(0xEF01, offset); offset += 2;
    buf.writeUInt16BE(net.model, offset); offset += 2;
    buf.writeUInt32BE(net.fwVer, offset); offset += 4;
    net.ip.forEach(b => buf.writeUInt8(b, offset++));
    net.mask.forEach(b => buf.writeUInt8(b, offset++));
    net.gw.forEach(b => buf.writeUInt8(b, offset++));
    net.mac.forEach(b => buf.writeUInt8(b, offset++));
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    
    return buf;
}

function buildV5008ModuleInfo(moduleIndex = 1) {
    const modConfig = DEVICES.v5008.modules.find(m => m.index === moduleIndex);
    if (!modConfig) return null;
    
    const net = DEVICE_NETWORK.v5008;
    const buf = Buffer.alloc(2 + 1 + 4 + 4);
    let offset = 0;
    
    buf.writeUInt16BE(0xEF02, offset); offset += 2;
    buf.writeUInt8(moduleIndex, offset++);
    buf.writeUInt32BE(net.fwVer, offset); offset += 4;
    buf.writeUInt32BE(state.getNextMsgId(), offset);
    
    return buf;
}

// ============================================================================
// V6800 JSON MESSAGE BUILDERS
// ============================================================================

function buildV6800Heartbeat(moduleIndex = 1) {
    const modConfig = DEVICES.v6800.modules.find(m => m.index === moduleIndex);
    if (!modConfig) return null;
    
    return JSON.stringify({
        msg_type: 'heart_beat_req',
        gateway_sn: DEVICES.v6800.id,
        uuid_number: state.getNextMsgId(),
        data: [{
            module_index: moduleIndex,
            module_sn: modConfig.moduleSn,
            module_u_num: modConfig.rfid.totalSlots
        }]
    });
}

function buildV6800HeartbeatAll() {
    // Build a heartbeat message containing ALL modules
    // This is required because the normalizer's reconcileMetadata treats 
    // each heartbeat as the complete module list
    return JSON.stringify({
        msg_type: 'heart_beat_req',
        gateway_sn: DEVICES.v6800.id,
        uuid_number: state.getNextMsgId(),
        data: DEVICES.v6800.modules.map(mod => ({
            module_index: mod.index,
            module_sn: mod.moduleSn,
            module_u_num: mod.rfid.totalSlots
        }))
    });
}

function buildV6800TempHum(moduleIndex = 1) {
    const modConfig = DEVICES.v6800.modules.find(m => m.index === moduleIndex);
    const modState = state.v6800.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    const cfg = modConfig.sensors.tempHum;
    // Add some variation
    const temp = modState.temp + (Math.random() - 0.5) * 2;
    const hum = modState.hum + (Math.random() - 0.5) * 5;
    
    return JSON.stringify({
        msg_type: 'temper_humidity_exception_nofity_req',
        gateway_sn: DEVICES.v6800.id,
        uuid_number: state.getNextMsgId(),
        data: [{
            module_index: moduleIndex,
            module_sn: modConfig.moduleSn,
            data: [{
                temper_position: cfg.position,
                temper_swot: parseFloat(temp.toFixed(1)),
                hygrometer_swot: parseFloat(hum.toFixed(1))
            }]
        }]
    });
}

function buildV6800Door(moduleIndex = 1) {
    const modConfig = DEVICES.v6800.modules.find(m => m.index === moduleIndex);
    const modState = state.v6800.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    if (modConfig.dualDoor) {
        // Randomly toggle one door
        const toggleDoor1 = Math.random() > 0.5;
        if (toggleDoor1) {
            modState.door1Open = !modState.door1Open;
        } else {
            modState.door2Open = !modState.door2Open;
        }
        
        return {
            payload: JSON.stringify({
                msg_type: 'door_state_changed_notify_req',
                gateway_sn: DEVICES.v6800.id,
                uuid_number: state.getNextMsgId(),
                data: [{
                    module_index: moduleIndex,
                    module_sn: modConfig.moduleSn,
                    new_state1: modState.door1Open ? 1 : 0,
                    new_state2: modState.door2Open ? 1 : 0
                }]
            }),
            moduleIndex: moduleIndex,
            state: `D1:${modState.door1Open ? '🔓' : '🔒'} D2:${modState.door2Open ? '🔓' : '🔒'}`
        };
    }
}

function buildV6800RfidSnapshot(moduleIndex = 1) {
    const modConfig = DEVICES.v6800.modules.find(m => m.index === moduleIndex);
    const modState = state.v6800.find(m => m.index === moduleIndex);
    if (!modConfig || !modState) return null;
    
    const tags = Array.from(modState.tags).sort((a, b) => a - b);
    
    return JSON.stringify({
        msg_type: 'u_state_resp',
        gateway_sn: DEVICES.v6800.id,
        uuid_number: state.getNextMsgId(),
        data: [{
            module_index: moduleIndex,
            extend_module_sn: modConfig.moduleSn,
            data: tags.map(uPos => ({
                u_index: uPos,
                tag_code: TAG_DATABASE[(uPos - 1) % TAG_DATABASE.length].id,
                warning: 0
            }))
        }]
    });
}

function buildV6800DevModInfo(moduleIndex = 1) {
    const modConfig = DEVICES.v6800.modules.find(m => m.index === moduleIndex);
    if (!modConfig) return null;
    
    const net = DEVICE_NETWORK.v6800;
    return JSON.stringify({
        msg_type: 'devies_init_req',
        gateway_sn: DEVICES.v6800.id,
        uuid_number: state.getNextMsgId(),
        gateway_ip: net.ip,
        gateway_mac: net.mac,
        data: [{
            module_index: moduleIndex,
            module_sn: modConfig.moduleSn,
            module_sw_version: net.fwVer,
            module_u_num: modConfig.rfid.totalSlots
        }]
    });
}

// ============================================================================
// SIMULATION SCENARIOS
// ============================================================================

class Simulator {
    constructor(client) {
        this.client = client;
        this.running = true;
    }

    async start() {
        log('SYSTEM', '🚀 Starting IoT Device Simulator v3', '🎮');
        log('SYSTEM', `MQTT Broker: ${MQTT_BROKER}`);
        log('SYSTEM', `Simulation Speed: ${SIMULATION_SPEED}x`);
        
        // Device Registration
        await this.registerDevices();
        
        // Start simulation loops
        this.startV5008Loop();
        this.startV6800Loop();
        
        // Start environmental drift
        setInterval(() => state.driftEnvironment(), 5000 / SIMULATION_SPEED);
        
        log('SYSTEM', '✅ All devices online and publishing', '✨');
    }

    async registerDevices() {
        log('SYSTEM', '📡 Registering devices...', '📋');
        
        // Get enabled modules for each device
        const v5008Mods = simConfig.getEnabledModules('v5008');
        const v6800Mods = simConfig.getEnabledModules('v6800');
        
        // V5008 Device Info (global) - only if any V5008 module is enabled
        if (v5008Mods.length > 0) {
            this.client.publish(
                `V5008Upload/${DEVICES.v5008.id}/DeviceInfo`,
                buildV5008DeviceInfo()
            );
            
            // V5008 Module Info for each enabled module
            v5008Mods.forEach(({ index }) => {
                this.client.publish(
                    `V5008Upload/${DEVICES.v5008.id}/ModuleInfo`,
                    buildV5008ModuleInfo(index)
                );
                const mod = DEVICES.v5008.modules.find(m => m.index === index);
                log('V5008', `Module #${index} registered (ID: ${mod.id})`, '📦');
            });
            
            // Initial heartbeats for enabled modules
            v5008Mods.forEach(({ index }) => {
                this.client.publish(
                    `V5008Upload/${DEVICES.v5008.id}/OpeAck`,
                    buildV5008Heartbeat(index)
                );
            });
        }
        
        // V6800 Device Info for each enabled module
        if (v6800Mods.length > 0) {
            v6800Mods.forEach(({ index }) => {
                this.client.publish(
                    `V6800Upload/${DEVICES.v6800.id}/devies_init_req`,
                    buildV6800DevModInfo(index)
                );
                const mod = DEVICES.v6800.modules.find(m => m.index === index);
                log('V6800', `Module #${index} registered (SN: ${mod.moduleSn})`, '📦');
            });
            
            // V6800: Send initial heartbeat with all enabled modules
            const heartbeatModules = v6800Mods.map(({ index }) => {
                const mod = DEVICES.v6800.modules.find(m => m.index === index);
                return {
                    module_index: index,
                    module_sn: mod.moduleSn,
                    module_u_num: mod.rfid.totalSlots
                };
            });
            
            this.client.publish(
                `V6800Upload/${DEVICES.v6800.id}/heart_beat_req`,
                JSON.stringify({
                    msg_type: 'heart_beat_req',
                    gateway_sn: DEVICES.v6800.id,
                    uuid_number: state.getNextMsgId(),
                    data: heartbeatModules
                })
            );
        }
        
        log('SYSTEM', 'Device registration complete', '✅');
        await delay(1000);
    }

    startV5008Loop() {
        const enabledMods = simConfig.getEnabledModules('v5008');
        if (enabledMods.length === 0) {
            log('V5008', 'No modules enabled, skipping V5008 simulation', '⏭️');
            return;
        }

        // Heartbeat every 5s - includes all modules
        if (enabledMods.some(m => m.config.heartbeat)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v5008', index, 'heartbeat')) {
                        this.client.publish(
                            `V5008Upload/${DEVICES.v5008.id}/OpeAck`,
                            buildV5008Heartbeat(index)
                        );
                    }
                });
            }, 5000 / SIMULATION_SPEED);
        }

        // Temp/Hum every 6s - for each module
        if (enabledMods.some(m => m.config.env)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v5008', index, 'env')) {
                        const modState = state.v5008.find(m => m.index === index);
                        this.client.publish(
                            `V5008Upload/${DEVICES.v5008.id}/TemHum`,
                            buildV5008TempHum(index)
                        );
                        log('V5008', `Mod#${index} Temp/Hum: ${formatTemp(modState.temp)} / ${formatHum(modState.hum)}`, '🌡️');
                    }
                });
            }, 6000 / SIMULATION_SPEED);
        }

        // Noise every 8s - for each module
        if (enabledMods.some(m => m.config.noise)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v5008', index, 'noise')) {
                        const modState = state.v5008.find(m => m.index === index);
                        this.client.publish(
                            `V5008Upload/${DEVICES.v5008.id}/Noise`,
                            buildV5008Noise(index)
                        );
                        log('V5008', `Mod#${index} Noise: ${formatNoise(modState.noise)}`, '🔊');
                    }
                });
            }, 8000 / SIMULATION_SPEED);
        }

        // Door every 15s - for each module
        if (enabledMods.some(m => m.config.door)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v5008', index, 'door')) {
                        const result = buildV5008Door(index);
                        if (result) {
                            this.client.publish(
                                `V5008Upload/${DEVICES.v5008.id}/Door`,
                                result.buffer
                            );
                            log('V5008', `Mod#${result.moduleIndex} Door: ${result.state}`, '🚪');
                        }
                    }
                });
            }, 15000 / SIMULATION_SPEED);
        }

        // RFID Snapshot every 30s - for each module
        if (enabledMods.some(m => m.config.rfid)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v5008', index, 'rfid')) {
                        const result = buildV5008RfidSnapshot(index);
                        if (result) {
                            this.client.publish(
                                `V5008Upload/${DEVICES.v5008.id}/LabelState`,
                                result.buffer
                            );
                            log('V5008', `Mod#${result.moduleIndex} RFID: ${result.tagCount} tags [${result.tags.join(', ')}]`, '📋');
                        }
                    }
                });
            }, 30000 / SIMULATION_SPEED);
        }
    }

    startV6800Loop() {
        const enabledMods = simConfig.getEnabledModules('v6800');
        if (enabledMods.length === 0) {
            log('V6800', 'No modules enabled, skipping V6800 simulation', '⏭️');
            return;
        }

        // Heartbeat every 5s - single message with ALL enabled modules
        // IMPORTANT: The normalizer's reconcileMetadata treats heartbeat as authoritative
        // for module presence, so we must include all enabled modules in one message
        if (enabledMods.some(m => m.config.heartbeat)) {
            setInterval(() => {
                // Build heartbeat with only modules that have heartbeat enabled
                const heartbeatModules = enabledMods
                    .filter(({ config }) => config.heartbeat)
                    .map(({ index }) => {
                        const mod = DEVICES.v6800.modules.find(m => m.index === index);
                        return {
                            module_index: index,
                            module_sn: mod.moduleSn,
                            module_u_num: mod.rfid.totalSlots
                        };
                    });
                
                if (heartbeatModules.length > 0) {
                    this.client.publish(
                        `V6800Upload/${DEVICES.v6800.id}/heart_beat_req`,
                        JSON.stringify({
                            msg_type: 'heart_beat_req',
                            gateway_sn: DEVICES.v6800.id,
                            uuid_number: state.getNextMsgId(),
                            data: heartbeatModules
                        })
                    );
                    log('V6800', `Heartbeat: ${heartbeatModules.length} modules`, '💓');
                }
            }, 5000 / SIMULATION_SPEED);
        }

        // Temp/Hum every 7s - for each module
        if (enabledMods.some(m => m.config.env)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v6800', index, 'env')) {
                        this.client.publish(
                            `V6800Upload/${DEVICES.v6800.id}/temper_humidity_exception_nofity_req`,
                            buildV6800TempHum(index)
                        );
                        const modState = state.v6800.find(m => m.index === index);
                        log('V6800', `Mod#${index} Temp/Hum: ${formatTemp(modState.temp)} / ${formatHum(modState.hum)}`, '🌡️');
                    }
                });
            }, 7000 / SIMULATION_SPEED);
        }

        // Door every 12s (dual door) - for each module
        if (enabledMods.some(m => m.config.door)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v6800', index, 'door')) {
                        const result = buildV6800Door(index);
                        if (result) {
                            this.client.publish(
                                `V6800Upload/${DEVICES.v6800.id}/door_state_changed_notify_req`,
                                result.payload
                            );
                            log('V6800', `Mod#${result.moduleIndex} ${result.state}`, '🚪');
                        }
                    }
                });
            }, 12000 / SIMULATION_SPEED);
        }

        // RFID Snapshot every 30s - for each module
        if (enabledMods.some(m => m.config.rfid)) {
            setInterval(() => {
                enabledMods.forEach(({ index }) => {
                    if (simConfig.isEnabled('v6800', index, 'rfid')) {
                        const modState = state.v6800.find(m => m.index === index);
                        const payload = buildV6800RfidSnapshot(index);
                        this.client.publish(
                            `V6800Upload/${DEVICES.v6800.id}/u_state_resp`,
                            payload
                        );
                        log('V6800', `Mod#${index} RFID: ${modState.tags.size} tags present`, '📋');
                    }
                });
            }, 30000 / SIMULATION_SPEED);
        }
    }

    async simulateTagOperation() {
        // Simulate a tag attach/detach cycle on the first V5008 module
        const mod = DEVICES.v5008.modules[0];
        const modState = state.v5008.find(m => m.index === mod.index);
        
        log('EVENT', `🏷️ Tag Operation on V5008 Mod#${mod.index}`, '▶️');
        
        // Attach a new tag
        const available = [];
        for (let i = 1; i <= mod.rfid.totalSlots; i++) {
            if (!modState.tags.has(i)) available.push(i);
        }
        
        if (available.length > 0) {
            const uPos = available[Math.floor(Math.random() * available.length)];
            modState.tags.add(uPos);
            const tag = TAG_DATABASE[(uPos - 1) % TAG_DATABASE.length];
            log('EVENT', `Tag ATTACHED: ${tag.name} at slot ${uPos}`, '📎');
        }
        
        await delay(5000);
        
        // Detach a tag
        const tags = Array.from(modState.tags);
        if (tags.length > 0) {
            const uPos = tags[Math.floor(Math.random() * tags.length)];
            modState.tags.delete(uPos);
            const tag = TAG_DATABASE[(uPos - 1) % TAG_DATABASE.length];
            log('EVENT', `Tag DETACHED: ${tag.name} from slot ${uPos}`, '👋');
        }
        
        // Force snapshot update
        const result = buildV5008RfidSnapshot(mod.index);
        this.client.publish(
            `V5008Upload/${DEVICES.v5008.id}/LabelState`,
            result.buffer
        );
    }
}

// ============================================================================
// MAIN
// ============================================================================

function printUsage() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     🌐 IoT Middleware Pro - Device Simulator v3 🌐        ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Usage: node scripts/simulate_devices.js [config...]       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Config Format:                                            ║');
    console.log('║    v5008/mod#1/all              - All messages (default)   ║');
    console.log('║    v5008/mod#1/door             - Only door messages       ║');
    console.log('║    v5008/mod#1/door&rfid        - Door + RFID              ║');
    console.log('║    v6800/mod#2/env&rfid         - Env + RFID               ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Message Types:                                            ║');
    console.log('║    all, hb (heartbeat), door, rfi d, env, noise            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Examples:                                                 ║');
    console.log('║    node simulate_devices.js v5008/mod#1/all               ║');
    console.log('║    node simulate_devices.js v5008/mod#1/door v5008/mod#2/rfid');
    console.log('║    node simulate_devices.js v6800/mod#1/all v6800/mod#2/door&env');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
}

async function main() {
    // Print usage info
    printUsage();
    
    // Show current configuration summary (simConfig is initialized after DEVICES)
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  📋 Current Configuration                                  ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    simConfig.printSummary();
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const client = mqtt.connect(MQTT_BROKER, {
        clientId: `simulator-${Date.now()}`,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 5000
    });

    client.on('connect', async () => {
        const simulator = new Simulator(client);
        await simulator.start();
    });

    client.on('error', (err) => {
        log('WARN', `MQTT Error: ${err.message}`, '⚠️');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  👋 Shutting down simulator...                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        client.end(true, () => {
            console.log('✅ Disconnected from MQTT broker\n');
            process.exit(0);
        });
    });
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
