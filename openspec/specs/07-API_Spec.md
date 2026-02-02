# API Design Specification

### 1. API Design Specification

**Endpoint:** `POST /api/commands`**Goal:** Send a control command to a specific device.

### Request Body (JSON)

The Upper App must send data that matches the **Input Data Contract** defined in your `CommandService` guide.

```json
{
  "deviceId": "2437871205",
  "deviceType": "V5008",        // "V5008" or "V6800"
  "messageType": "SET_COLOR",   // The Unified Enum
  "payload": {
    "moduleIndex": 1,
    "sensorIndex": 10,
    "colorCode": 1
  }
}

```

### Response

- **202 Accepted:** Command validated and queued (Emitted to EventBus).
- **400 Bad Request:** Missing `deviceId` or `messageType`.

---

### 2. Implementation Logic (For `ApiServer.js`)

You should guide the AI to implement this route. Here is the logic flow:

1. **Receive POST:** Parse `req.body`.
2. **Validate:** Ensure `deviceId` and `messageType` exist.
3. **Emit Event:**
    
    ```jsx
    // Get the singleton EventBus
    const eventBus = require('../../core/EventBus');
    
    // Construct the internal event
    const commandEvent = {
        deviceId: req.body.deviceId,
        deviceType: req.body.deviceType,
        messageType: req.body.messageType,
        payload: req.body.payload || {}
    };
    
    // Emit to the internal nervous system
    eventBus.emit('command.request', commandEvent);
    
    ```
    
4. **Respond:** Send JSON `{ "status": "sent", "commandId": "..." }`.

---

### 3. Updates to Documentation

You should add this requirement to **`IoT_Middleware_Pro_Implementation_Guide_v3.3.md`** under **Section 6: API Requirements**.

**Add this block to Section 6:**

### 6.3 Send Command (Control)

- **POST** `/api/commands`
- **Input:** JSON object containing `deviceId`, `deviceType`, `messageType`, and `payload`.
- **Logic:**
    1. Validate required fields.
    2. Emit `command.request` event to the `EventBus`.
    3. Return HTTP 202 (Accepted).
- **Note:** This endpoint does **not** wait for the device to respond (Async). The device response will come back via MQTT later and update the Cache/DB asynchronously.

---

### Summary of the Flow

1. **Upper App** sends `POST /api/commands` (JSON).
2. **ApiServer** emits `command.request` (Event).
3. **CommandService** wakes up, translates Event to Hex/JSON, and publishes to MQTT `.../Download`.
4. **Device** receives MQTT, executes command, and sends a Response (e.g., `SET_CLR_RESP`).
5. **Normalizer** processes Response and updates DB/Cache.
6. **Dashboard** sees the update via WebSocket/Polling.