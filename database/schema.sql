-- IoT Middleware Pro Database Schema
-- Version: 2.1.0
-- Engine: MySQL InnoDB
-- 
-- Alignment Rules:
-- - parse_at: SUO creation time (when message was parsed)
-- - update_at: DB operation time (when record was inserted/updated)
-- - All tables have both columns for consistency

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS iot_middleware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_middleware;

-- ============================================
-- CLEANUP: Drop existing tables
-- ============================================

DROP TABLE IF EXISTS iot_topchange_event;
DROP TABLE IF EXISTS iot_cmd_result;
DROP TABLE IF EXISTS iot_heartbeat;
DROP TABLE IF EXISTS iot_door_event;
DROP TABLE IF EXISTS iot_rfid_snapshot;
DROP TABLE IF EXISTS iot_rfid_event;
DROP TABLE IF EXISTS iot_noise_level;
DROP TABLE IF EXISTS iot_temp_hum;
DROP TABLE IF EXISTS iot_meta_data;

-- ============================================
-- TABLE: Device Metadata (UPSERT)
-- ============================================
-- Source: DEVICE_METADATA SUO
-- Strategy: UPSERT on device_id
-- Notes: Tracks device info and module list from HEARTBEAT + DEVICE_INFO/MODULE_INFO

CREATE TABLE IF NOT EXISTS iot_meta_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    device_type   CHAR(5) NOT NULL,
    
    -- Device-level fields from SUO (root level)
    device_fwVer  VARCHAR(32) DEFAULT NULL,  -- SUO.fwVer (V5008 only)
    device_mask   VARCHAR(32) DEFAULT NULL,  -- SUO.mask (V5008 only)
    device_gwIp   VARCHAR(32) DEFAULT NULL,  -- SUO.gwIp (V5008 only)
    device_ip     VARCHAR(32) DEFAULT NULL,  -- SUO.ip
    device_mac    VARCHAR(32) DEFAULT NULL,  -- SUO.mac
    
    -- SUO.payload[] as JSON (module list with moduleIndex, moduleId, fwVer, uTotal)
    active_modules JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3) 
                  ON UPDATE CURRENT_TIMESTAMP(3),  -- DB operation time
    
    UNIQUE KEY uk_device_id (device_id),
    INDEX idx_meta_type (device_type, update_at DESC),
    INDEX idx_parse_at (parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Temperature & Humidity (Append-only)
-- ============================================
-- Source: TEMP_HUM SUO
-- Strategy: Append-only, pivoted storage
-- Notes: One row per module, sensorIndex 10-15 → temp_indexXX/hum_indexXX columns

CREATE TABLE IF NOT EXISTS iot_temp_hum (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- Pivoted from SUO.payload[]: sensorIndex 10-15
    temp_index10  DECIMAL(5,2), hum_index10  DECIMAL(5,2),
    temp_index11  DECIMAL(5,2), hum_index11  DECIMAL(5,2),
    temp_index12  DECIMAL(5,2), hum_index12  DECIMAL(5,2),
    temp_index13  DECIMAL(5,2), hum_index13  DECIMAL(5,2),
    temp_index14  DECIMAL(5,2), hum_index14  DECIMAL(5,2),
    temp_index15  DECIMAL(5,2), hum_index15  DECIMAL(5,2),
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_th (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Noise Level (Append-only, V5008 only)
-- ============================================
-- Source: NOISE_LEVEL SUO
-- Strategy: Append-only, pivoted storage
-- Notes: One row per module, sensorIndex 16-18 → noise_indexXX columns

CREATE TABLE IF NOT EXISTS iot_noise_level (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- Pivoted from SUO.payload[]: sensorIndex 16-18
    noise_index16 DECIMAL(5,2),
    noise_index17 DECIMAL(5,2),
    noise_index18 DECIMAL(5,2),
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_noise (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: RFID Events (Append-only)
-- ============================================
-- Source: RFID_EVENT SUO
-- Strategy: Append-only, one row per event
-- Notes: message_id for traceability - links to original message that triggered this event

CREATE TABLE IF NOT EXISTS iot_rfid_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for event traceability)
    
    -- From SUO.payload[]
    sensor_index  INT NOT NULL,              -- payload.sensorIndex
    tag_id        VARCHAR(32) NOT NULL,      -- payload.tagId
    action        CHAR(10) NOT NULL,         -- payload.action (ATTACHED/DETACHED/ALARM_ON/ALARM_OFF)
    alarm         BOOLEAN DEFAULT FALSE,     -- payload.isAlarm
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_rfid_evt (tag_id, device_id, module_index, parse_at DESC),
    INDEX idx_rfid_device (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_action (action, parse_at DESC),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: RFID Snapshots (Append-only)
-- ============================================
-- Source: RFID_SNAPSHOT SUO
-- Strategy: Append-only, JSON storage
-- Notes: Stores full snapshot as JSON for history

CREATE TABLE IF NOT EXISTS iot_rfid_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- SUO.payload[] as JSON: [{sensorIndex, tagId, isAlarm}]
    rfid_snapshot JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_rfid_snap (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Door Events (Append-only)
-- ============================================
-- Source: DOOR_STATE SUO
-- Strategy: Append-only
-- Notes: message_id for traceability - links to original message

CREATE TABLE IF NOT EXISTS iot_door_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    module_index  INT NOT NULL,              -- SUO.moduleIndex
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for event traceability)
    
    -- From SUO.payload[] (expanded to columns)
    doorState     INT,                       -- payload.doorState (single door)
    door1State    INT,                       -- payload.door1State (dual door A)
    door2State    INT,                       -- payload.door2State (dual door B)
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_door (device_id, module_index, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Heartbeats (Append-only)
-- ============================================
-- Source: HEARTBEAT SUO
-- Strategy: Append-only, JSON storage
-- Notes: Stores active_modules (module list) from heartbeat

CREATE TABLE IF NOT EXISTS iot_heartbeat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    message_id    VARCHAR(32) DEFAULT NULL,  -- SUO.messageId (for traceability)
    
    -- SUO.payload[] as JSON: [{moduleIndex, moduleId, uTotal}]
    active_modules JSON,
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_hb (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Command Results (Append-only)
-- ============================================
-- Source: QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP SUO
-- Strategy: Append-only
-- Notes: message_id links response to original command

CREATE TABLE IF NOT EXISTS iot_cmd_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (response message ID)
    
    -- SUO.messageType
    cmd           VARCHAR(32) NOT NULL,      -- QRY_CLR_RESP, SET_CLR_RESP, CLN_ALM_RESP
    
    -- From SUO.payload[]
    result        VARCHAR(32) NOT NULL,      -- payload.result (Success/Failure)
    original_req  VARCHAR(512),              -- payload.originalReq (echoed command)
    color_map     JSON,                      -- payload.colorMap (QRY_CLR_RESP only)
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_cmd (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_cmd_type (cmd, result),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: Topology Change Events (Append-only)
-- ============================================
-- Source: META_CHANGED_EVENT SUO
-- Strategy: Append-only
-- Notes: One row per change description

CREATE TABLE IF NOT EXISTS iot_topchange_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id     VARCHAR(32) NOT NULL,
    device_type   CHAR(5) NOT NULL,          -- SUO.deviceType
    message_id    VARCHAR(32) NOT NULL,      -- SUO.messageId (for traceability)
    
    -- From SUO.payload[].description
    event_desc    VARCHAR(512) NOT NULL,     -- Human-readable change description
    
    -- Timestamps
    parse_at      DATETIME(3) NOT NULL,      -- SUO creation time
    update_at     DATETIME(3) NOT NULL 
                  DEFAULT CURRENT_TIMESTAMP(3) 
                  ON UPDATE CURRENT_TIMESTAMP(3),  -- DB operation time
    
    INDEX idx_top_chng (device_id, parse_at DESC),
    INDEX idx_message_id (message_id),
    INDEX idx_device_type (device_type, parse_at DESC),
    INDEX idx_update_at (update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
