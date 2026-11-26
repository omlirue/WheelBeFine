# Wheel Be Fine

**A calm, low-pressure driving simulator that helps nervous teens build skills and confidence before they get behind the wheel.**

Lots of teens feel anxious about learning to drive, and some put off getting their license because of it. Wheel Be Fine gives them a safe place to practice first, one small step at a time, with friendly coaching instead of "game over" screens.

## Features

- **Carefree look and feel:** a cream and pistachio color theme with coral, sky, and sunshine accents, EB Garamond (a classic serif) for headings, Hanken Grotesk (a clean sans serif) for text, both bundled in the app under the SIL Open Font License, and a heart-shaped steering wheel logo.
- **Earn your way up:** each drive shows a difficulty rating (Beginner to Final boss). Score 60 or higher to complete a drive and unlock the next. Completed drives are marked with a check, a green border, and your best score.
- **Final boss:** Manhattan Streets has its own night-skyline look and a "Final boss" ribbon.
- **Celebrations:** confetti after every completed drive, and a printable **Wheel Be Fine certificate** (with your name and scores) when you finish all six drives.

- **Six practice drives that build step by step:** Empty Parking Lot → Quiet Loop → Stop Signs → Crosswalks → Light Traffic → Manhattan Streets. Each drive adds one new skill, and finishing one unlocks the next.
- **Manhattan Streets:** a busy city drive with a green bike lane full of people on Citi Bikes and e-scooters, a delivery truck double-parked in the bike lane that forces riders into your lane, jaywalkers who step out in the middle of your right turns, a yellow taxi and a city bus that stops at bus stops, oncoming cars and buses, and three traffic lights with cross streets (cross traffic drives through while your light is red). It checks that you stop for red lights, stay on your side of the yellow line, stay out of the bike lane, give riders at least 3 feet when passing, and stop for people crossing, even outside a crosswalk.
- **Pre-drive safety checklist:** before every drive you check off four steps in order (seat belt, mirrors, look for cars and pedestrians, foot on the brake and shift into Drive or Reverse). The drive starts only after step 4.
- **A real gear shifter:** every drive starts in Park. Hold the brake and shift into Drive to go, shift into Reverse to back up, and shift back into Park to finish, just like a real automatic car.
- **Clear goals before every drive:** a start card shows the drive's goal step by step (with a diagram for the parking lot) and the controls. The car waits until you press Start.
- **On-screen controls key:** shows which key does what (W gas, S brake, A / D steer, Q / E gears), and each key lights up while you press it. Press K or the Keys button to hide it.
- **Hints when you seem stuck:** if you sit still or head the wrong way, the coach tells you exactly which key to press. Parking-lot checkpoints are numbered so the order is clear.
- **A friendly coach:** short, encouraging tips appear while you drive ("Curve ahead. Ease off the gas before you turn.").
- **Feedback that teaches:** after each drive you see what went well, one or two things to try next time, and a "calm & safe" score.
- **Built-in calming tools:** a guided breathing exercise before you drive, and a Pause button (or the space bar) that freezes everything and opens a breathing guide.
- **Feeling check-ins:** a quick "How are you feeling?" check-in (1 = calm, 10 = anxious) before and after every drive, with a chart showing how you felt over time.
- **Real driving rules:** speed limits, staying in your lane, full stops at stop signs, yielding to pedestrians, and following distance.
- **Smooth controls:** pedals and steering ramp up gradually, so tapping gives small inputs. This rewards gentle braking and steering, like real driving.
- **900° steering wheel:** like the 900° wheel setting in racing games, the wheel turns up to 450° each way (about 2.5 turns lock to lock), and the wheel turns smoothly: about 1.4 seconds from center to full lock on the keyboard, and it stays right under your thumb on a phone.
- **Two camera views:** a driver's-seat view from inside the car, with a dashboard speedometer (green up to the speed limit, red above it), a gear indicator (P, R, or D), a speed-limit display, and a steering wheel that turns as you steer, or a map view from above that makes lanes and distances easy to see. Switch anytime with the button or the V key.
- **Controls that fit your device:** the keyboard on a computer, or an on-screen steering wheel and pedals on a phone or tablet. The app picks automatically.

## How to run it

No installation needed. Download the folder and open `index.html` in Chrome, Edge, Firefox, or Safari.

To play it online, turn on GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch).

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Shift gears (Park, Reverse, Drive) | E = up (P → R → D), Q = down (D → R → P). Stop first; hold S to leave Park. Or click P, R, D | Tap P, R, or D above the wheel |
| Gas | W | Gas pedal |
| Brake | S | Brake pedal |
| Steer | A / D | Turn the on-screen wheel in a circle |
| Pause and breathe | Space or Esc | Pause button |
| Switch driver / map view | V | Driver view button |
| Show / hide controls key | K | — |

## How it's built

- Plain HTML, CSS, and JavaScript, with no libraries or frameworks.
- The game is drawn on an HTML `<canvas>`.
- **Realistic physics (`js/physics.js`):** a dynamic bicycle model like those used in driving simulators. Tires make grip from their slip angle using a simplified Pacejka "magic formula," and grip peaks and then falls off, so the car can understeer, oversteer, and skid. Braking and accelerating share the tires' grip (the friction circle), braking shifts weight onto the front tires, and the car has realistic mass, yaw inertia, engine power, braking (about 0.9 g, with ABS), and drag. There is no downforce and no stability control. Grass has about half the grip of asphalt. Skids leave tire marks on the road.
- The road is a loop made of many short line segments. The game projects the car onto the road every frame to know how far along the lap it is and whether it's in the correct lane.
- The driver's view is a simple 3D renderer written from scratch. Each point is converted into "distance in front" and "distance to the right" of the driver, then divided by distance for perspective. The road is drawn as flat polygons (clipped so nothing behind the driver is drawn), and trees, signs, people, and cars are drawn farthest-first so closer objects cover farther ones.
- Progress is saved in the browser with `localStorage`.

| File | What it does |
|---|---|
| `index.html` | All the screens |
| `css/style.css` | Styling |
| `js/storage.js` | Saving progress and settings |
| `js/input.js` | Keyboard and touch input, with gentle ramp-up on pedals and steering |
| `js/physics.js` | Realistic car physics: tire grip, friction circle, weight transfer |
| `js/world.js` | The six drives and the maps (suburban loop, parking lot, city block) |
| `js/game.js` | Car physics, driving rules, coach messages, and drawing |
| `js/app.js` | Screen flow, breathing guide, results, and progress chart |

## AI use disclosure

<!-- EDIT THIS SECTION so it accurately describes how YOU used AI. The Congressional App Challenge requires full disclosure. -->

This project was built with help from Claude, an AI assistant made by Anthropic. Claude generated the starting code for the simulator based on my idea and design goals. I then [describe what you did yourself: tested it, changed levels, adjusted the physics, rewrote text, added features, etc.].

## Disclaimer

Wheel Be Fine is practice, not a replacement for real driving lessons. Always learn with a licensed adult or instructor, and follow your state's rules for learner's permits.
