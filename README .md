# Hand Tracking 3D Shape Viewer

A real-time hand gesture interaction system built with **p5.js** and **MediaPipe Hands**. It renders interactive 3D LED-style geometric shapes that can be controlled through hand gestures captured via webcam.

---

## Features

- Real-time hand tracking via MediaPipe Hands (runs entirely in the browser)
- 3D LED-point rendering of four geometric shapes: Rhombus, Rectangle, Triangle, Sphere
- Gesture-based shape switching (left hand open palm)
- Gesture-based 3D rotation control (left hand index + thumb pinch)
- Floating mini-clone that follows the right hand index fingertip
- Spring-physics rotation smoothing
- Mirrored webcam background with overlay UI

---

## Gestures

| Gesture | Hand | Action |
|---|---|---|
| Full open palm (all fingers spread) | Left | Cycle to the next shape |
| Index finger + thumb open, other fingers closed | Left | Rotate the shape in 3D |
| Index finger pointing up, others closed | Right | Show a floating mini shape clone near the fingertip |

---

## Shapes

Each shape is rendered as a cloud of LED-like glowing points distributed along edges, vertices, and interior:

- **RHOMBUS** — a 3D diamond prism
- **RECTANGLE** — a rectangular cuboid (box)
- **TRIANGLE** — a triangular prism
- **SPHERE** — a sphere shell with inner scattered points

All shapes share an emerald green color palette with layered halo, core, and spark spheres per point.

---

## Technical Stack

| Component | Technology |
|---|---|
| Rendering | p5.js (WEBGL mode) |
| Hand Tracking | MediaPipe Hands (via CDN) |
| Font | JetBrains Mono (via CDN) |
| Language | JavaScript (p5.js sketch) |

---

## Setup & Usage

### Requirements

- A modern browser with WebRTC support (Chrome or Edge recommended)
- A webcam

### Running

1. Serve the sketch from a local or remote HTTP server (webcam access requires a secure context or `localhost`).
2. Open the page in your browser.
3. Grant camera permission when prompted.
4. Wait for the `loading mediapipe hands...` message to disappear.
5. Use your hands in front of the camera to interact.

A simple local server example using Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## Project Structure

```
sketch.js       Main p5.js sketch — setup, draw loop, gesture logic, shape rendering
```

All dependencies are loaded at runtime from CDN; no build step is required.

---

## Configuration

Key constants at the top of `sketch.js`:

| Constant | Default | Description |
|---|---|---|
| `W` | `960` | Canvas width (px) |
| `H` | `720` | Canvas height (px) |
| `PANEL_W` | `312` | Shape viewport panel width |
| `PANEL_H` | `228` | Shape viewport panel height |
| `PANEL_MARGIN` | `34` | Margin from canvas edge |

MediaPipe model options (inside `initHands()`):

| Option | Default | Description |
|---|---|---|
| `maxNumHands` | `2` | Maximum hands detected simultaneously |
| `modelComplexity` | `0` | 0 = lite (faster), 1 = full (more accurate) |
| `minDetectionConfidence` | `0.72` | Detection threshold |
| `minTrackingConfidence` | `0.55` | Tracking threshold |

---

## Architecture Notes

- **Hand handedness inversion**: MediaPipe returns labels relative to the camera image. Since the webcam feed is mirrored horizontally in the display, `"Right"` in MediaPipe data corresponds to the user's left hand, and vice versa. The functions `getPrimaryLeftHand()` and `getPrimaryRightHand()` account for this.
- **Spring physics**: Rotation targets are updated by gesture deltas; actual rotation values follow via a damped spring system (`stiffness = 0.058`, `damping = 0.84`) for smooth, inertial feel.
- **Shape caching**: LED point clouds are generated once at startup with random jitter baked in, then cached for the entire session.
- **Frame throttling**: Hand detection runs every other frame (`frameCount % 2 === 0`) and is gated by a `busy` flag to prevent overlapping async calls.

---

## Browser Compatibility

| Browser | Status |
|---|---|
| Chrome / Chromium | Recommended |
| Edge | Supported |
| Firefox | May have WebGL/webcam issues |
| Safari | Limited WebGL WEBGL mode support |

---

## License

This project does not include an explicit license file. All rights are reserved by the author unless otherwise stated.
