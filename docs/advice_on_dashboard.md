# advice_on_dashboard

The "Smart Heartbeat" is a backend infrastructure improvement that **automatically** makes the Frontend experience better without touching the React code.

Here is why, and the one small thing you should verify.

### 1. Why no code changes are needed

The Dashboard is designed to be **Reactive** (Passive).

1. **Before Smart Heartbeat:** If the cache was empty, the Dashboard showed empty data (e.g., "-- °C") until the user manually clicked "Refresh" or the device happened to send an update.
2. **After Smart Heartbeat:**
    - The Dashboard loads (shows empty "-- °C").
    - ~60 seconds later, the Middleware (Smart Heartbeat) triggers a query.
    - The Device responds.
    - The Middleware broadcasts standard `TEMP_HUM`, `RFID_SNAPSHOT`, etc., via **WebSocket**.
    - **The Dashboard Store (`useIoTStore.ts`) already has logic to handle these WebSocket messages.**
    - **Result:** The UI "magically" populates itself.

### 2. What to Verify (The "Sanity Check")

Even though you don't need *new* code, you should double-check that your existing **Zustand Store (`useIoTStore.ts`)** is handling the "Partial Merge" correctly.

- **Scenario:** The Dashboard receives `HEARTBEAT` (Device Online), but the sensor arrays are empty. 1 second later, it receives `TEMP_HUM`.
- **Verification:** Ensure your reducer logic doesn't **overwrite** the `activeRack` object; it must **merge** into it.

**Correct Logic (in `useIoTStore.ts`):**

```tsx
// Good: Merging
if (suo.messageType === 'TEMP_HUM') {
  state.activeRack.temp_hum = suo.payload; // Update ONLY temp
  // Do NOT touch rfid_snapshot or doorState
}
```

**Incorrect Logic (Bug to watch out for):**

```tsx
// Bad: Replacment
state.activeRack = suo.payload; // This wipes out everything else
```

### 3. Optional UX Polish (Nice to have)

Since the system now auto-repairs, you *could* update the UI text to manage user expectations, but it is optional.

- **Current UI:** Likely shows empty slots or "--".
- **Optional Update:** If `isOnline` is **True** but `rfid_snapshot` is empty, you could show a small text: *"Syncing data..."* or *"Waiting for Heartbeat cycle..."* instead of just blank space.

### Summary

You can proceed without frontend changes. The "Smart Heartbeat" fixes the "Empty Dashboard" problem purely from the backend side.