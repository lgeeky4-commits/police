# Border Control v1.5 — True Layouts & Landscape Command Mode

This update changes the **actual layouts** instead of only changing colors.

## Five different layout arrangements

- **Dark Bravo**: Classic three-column command view — marking/units left, map center, chat right.
- **Cool Night**: A wide map takes the upper-left area, operations below, communications down the right side.
- **Sunny Day**: Full-width map on top and two equal lower sections for marking and communications.
- **Cool Morning**: Reversed console — communications on the left, map center, operations on the right.
- **Midnight Orange**: Black/amber command view with left-hand MARKS / COLORS / UNITS / LAYOUTS tabs; center map; chat on right.

## Phone in landscape orientation

When the phone is held sideways and its browser reports a landscape orientation, the app always uses:

**LEFT:** Marking tools, Color/Night/Heat shortcuts, quick color settings, unit list, and layout button.

**CENTER:** Fully zoomable, draggable fictional reference map. The map remains in the center when switching layouts.

**RIGHT:** Shared chat at the top, walkie-talkie and photo/video controls below (scroll the side panel to reach them).

A phone locked in portrait orientation cannot be detected as landscape by a webpage merely because the physical phone is held sideways. Tap **SIDEWAYS VIEW** in the header to rotate the entire website 90° manually if your phone is locked in portrait. Tap **EXIT SIDEWAYS** to return to normal. This does not change your phone’s system settings.

## New color tools

Choose COLORS on the left side rail. Adjust map **brightness** and **hue** with separate sliders, or tap Color / Night / Heat for simulated vision. Palette settings stay local to the browser.

## Existing features preserved

4 players, chat, walkie-talkie, camera and video reports, dispatch, fullscreen, map zoom and pan, 30 wallpapers, Theme Studio, and small/large map reports.

## Deployment

Extract the ZIP and upload its contents to a GitHub repository, keeping `package.json` and `server.js` at the root. Deploy as a Render web service with `npm install` and `npm start`. HTTPS is required on phones for camera and microphone access.

This is a fictional roleplay simulator. Night/heat views are graphic effects, not real thermal imaging or live surveillance.


## Mission confirmation update

This is a fictional multiplayer roleplay map; locations and incident records are game data, not real emergency reports.

### Two-player mission confirmation
1. Place or open one of your own map items.
2. Press REQUEST MISSION CONFIRMATION.
3. A different connected player opens the same item in the same conversation/map.
4. That second player presses CONFIRM MISSION.
5. The server removes the mark for everyone in that room. The creator cannot self-confirm.

### Incident-number search
All Border Control marks, reports, dispatches, and blocked areas receive case numbers like `BC-2026-0001`. Use the incident-number search near the map items list. You can search by number, label, or note. Confirmed missions remain searchable in the completed-case list until the server restarts.

**Storage:** All records are held in the running demo server's memory. Restarting the server clears active and completed cases. Real multi-phone calling/radio remains dependent on browser permissions and network conditions.
