-- IoT Middleware Pro Database Schema
-- Version: 2.0.0
-- Engine: MySQL InnoDB

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS iot_middleware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_middleware;

-- Device Metadata Table
CREATE TABLE IF NOT EXISTS iot_meta_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    device_type  CHAR(5) NOT NULL,
    
    -- Superset of fields (Nullable)
    device_fwVer VARCHAR(32) DEFAULT NULL, -- V5008 Only
    device_mask  VARCHAR(32) DEFAULT NULL, -- V5008 Only
    device_gwIp  VARCHAR(32) DEFAULT NULL, -- V5008 Only
    
    -- Common fields
    device_ip    VARCHAR(32), 
    device_mac   VARCHAR(32),
    
    modules      JSON,  -- e.g. [{ "moduleIndex": 1, "fwVer": "1.0", "moduleId": "...", "uTotal":6}]
    parse_at     DATETIME(3) NOT NULL,
    update_at    DATETIME(3) NOT NULL,
    UNIQUE KEY uk_device_id (device_id),
    INDEX idx_meta_type (device_type, update_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Temperature & Humidity Table (Pivoted)
CREATE TABLE IF NOT EXISTS iot_temp_hum (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    -- Pivoted Columns 10-15
    temp_index10 DECIMAL(5,2), hum_index10 DECIMAL(5,2),
    temp_index11 DECIMAL(5,2), hum_index11 DECIMAL(5,2),
    temp_index12 DECIMAL(5,2), hum_index12 DECIMAL(5,2),
    temp_index13 DECIMAL(5,2), hum_index13 DECIMAL(5,2),
    temp_index14 DECIMAL(5,2), hum_index14 DECIMAL(5,2),
    temp_index15 DECIMAL(5,2), hum_index15 DECIMAL(5,2),
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_th (device_id, module_index, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Noise Level Table (Pivoted)
CREATE TABLE IF NOT EXISTS iot_noise_level (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    -- Pivoted Columns 16-18
    noise_index16 DECIMAL(5,2),
    noise_index17 DECIMAL(5,2),
    noise_index18 DECIMAL(5,2),
    parse_at      DATETIME(3) NOT NULL,
    INDEX idx_noise (device_id, module_index, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RFID Event Table
CREATE TABLE IF NOT EXISTS iot_rfid_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    sensor_index INT NOT NULL,
    tag_id       VARCHAR(32) NOT NULL,
    action       CHAR(10) NOT NULL, -- "ATTACHED", "DETACHED", "ALARM_ON", "ALARM_OFF"
    alarm        BOOLEAN DEFAULT FALSE,
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_rfid_evt (tag_id, device_id, module_index, parse_at DESC),
    INDEX idx_rfid_device (device_id, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RFID Snapshot Table
CREATE TABLE IF NOT EXISTS iot_rfid_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    rfid_snapshot JSON, -- Full Array: [{sensorIndex, tagId, isAlarm}]
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_rfid_snap (device_id, module_index, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Door Event Table
CREATE TABLE IF NOT EXISTS iot_door_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    module_index INT NOT NULL,
    doorState    INT, -- Single
    door1State   INT, -- Dual A
    door2State   INT, -- Dual B
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_door (device_id, module_index, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Heartbeat Table
CREATE TABLE IF NOT EXISTS iot_heartbeat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    modules      JSON, -- [{moduleIndex, moduleId, uTotal}]
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_hb (device_id, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Command Result Table
CREATE TABLE IF NOT EXISTS iot_cmd_result (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    cmd          VARCHAR(32) NOT NULL,
    result       VARCHAR(32) NOT NULL,
    original_req VARCHAR(512),
    color_map    JSON,
    parse_at     DATETIME(3) NOT NULL,
    INDEX idx_cmd (device_id, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Topology Change Event Table
CREATE TABLE IF NOT EXISTS iot_topchange_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id    VARCHAR(32) NOT NULL,
    device_type  CHAR(5) NOT NULL,
    event_desc   VARCHAR(512) NOT NULL, -- The human readable change string
    parse_at     DATETIME(3) NOT NULL,
    update_at    DATETIME(3) DEFAULT TIMESTAMP(3),
    INDEX idx_top_chng (device_id, parse_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
