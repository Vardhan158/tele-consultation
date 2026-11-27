import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { sampleCamera, sampleFov, sampleLookAt } from './cameraPath.js';
import { entranceProgress, beat } from './patientTimeline.js';
import { patientProgress, screenZoom } from './laptopTimeline.js';
import { bookingProgress, callStart } from './consultationTimeline.js';
import { earlierProgress } from './prescriptionTimeline.js';
import { carLaneZ, preTravelProgress, sampleTravel, travelProgress, walkPose } from './travelTimeline.js';
import { pharmacyFrame, pharmacyProgress, previousJourney } from './pharmacyTimeline.js';
import { samplePharmacyCamera } from './pharmacyCamera.js';
import { finaleProgress, previousStory } from './finaleTimeline.js';
import { sampleFinaleCamera } from './finaleCamera.js';

const screenCenter = new Vector3(3.192, 1.083, -1.34);
const screenEye = new Vector3(3.69, 1.215, -1.34);
const screenApproach = new Vector3(3.72, 1.39, -.42);
const conversationEye = new Vector3(3.90, 1.52, .33);
const conversationFocus = new Vector3(3.61, 1.33, -1.34);
const printerEye = new Vector3(2.13, 1.73, .49);
const printerFocus = new Vector3(3.48, 1.22, -.94);
const walkCamera = new CatmullRomCurve3([
  [2.25, 2.05, 1.55], [3.10, 2.12, 2.55], [3.62, 2.02, 2.96],
  [1.43, 1.93, 3.69], [1.40, 1.91, 4.83], [1.34, 2.03, 6.20],
  [2.60, 2.78, 8.70], [1.55, 3.25, 9.8], [-1.61, 2.70, 8.08],
].map((p) => new Vector3(...p)));

// Short physical dolly/orbit moves keep the subject framed during dialogue and prop work.
const drift = (points) => new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
const tableEye = drift([[0,0,0],[-.09,.035,.04],[-.16,.025,-.02]]);
const tableFocus = drift([[0,0,0],[-.045,.035,-.09],[-.12,.02,-.16]]);
const laptopEye = drift([[0,0,0],[.035,.012,.035],[-.024,-.014,-.027]]);
const laptopFocus = drift([[0,0,0],[0,.018,.011],[0,-.008,-.014]]);
const printEye = drift([[0,0,0],[.065,.025,.12],[-.055,-.019,.04]]);
const printFocus = drift([[0,0,0],[.04,-.038,.032],[-.06,-.06,.055]]);
const carEye = drift([[0,0,0],[.24,.09,.14],[.32,.18,-.16]]);
const carFocus = drift([[0,0,0],[-.12,-.04,.17],[-.03,.08,.29]]);

function driftShot(path, point, from, to, release, destination, offset) {
  if (point <= from || point >= release) return;
  const t = MathUtils.clamp((point - from) / (to - from), 0, 1);
  const weight = MathUtils.smoothstep(point, from, from + (to - from) * .22)
    * (1 - MathUtils.smoothstep(point, to, release));
  path.getPoint(t, offset);
  destination.addScaledVector(offset, weight);
}

function moveDuringAction(progress, eye, target, scratch) {
  driftShot(tableEye, progress, .155, .218, .232, eye, scratch.offset);
  driftShot(laptopEye, progress, .222, .376, .396, eye, scratch.offset);
  driftShot(printEye, progress, .392, .487, .501, eye, scratch.offset);
  driftShot(carEye, progress, .535, .573, .597, eye, scratch.offset);
  driftShot(tableFocus, progress, .155, .218, .232, target, scratch.offset);
  driftShot(laptopFocus, progress, .222, .376, .396, target, scratch.offset);
  driftShot(printFocus, progress, .392, .487, .501, target, scratch.offset);
  driftShot(carFocus, progress, .535, .573, .597, target, scratch.offset);
}

export function createCameraScratch() {
  return { eye: new Vector3(), target: new Vector3(), tangent: new Vector3(),
    trackingEye: new Vector3(), trackingTarget: new Vector3(), offset: new Vector3() };
}

export function sampleJourneyCamera(storyProgress, aspect, eye, lookAt, tripView) {
  const finale = finaleProgress(storyProgress);
  if (finale > 0) return sampleFinaleCamera(finale, aspect, eye, lookAt);
  const chapters = previousStory(storyProgress);
  const journey = previousJourney(chapters);
  const global = preTravelProgress(journey);
  const story = earlierProgress(global);
  const booking = bookingProgress(story);
  const progress = patientProgress(booking);
  const entrance = entranceProgress(progress);
  const portrait = MathUtils.smoothstep(1 - aspect, 0, .45);
  const focus = MathUtils.smoothstep(progress, .66, .765);
  const settle = beat(progress, 'sit');
  const zoom = MathUtils.smoothstep(booking, ...screenZoom);
  const conversation = MathUtils.smoothstep(story, .918, 1)
    * (1 - MathUtils.smoothstep(global, .79, .829));
  const printer = MathUtils.smoothstep(global, .899, .943);
  const endFov = MathUtils.radToDeg(2 * Math.atan(Math.max(.14, .19 / aspect) / .515));
  const existingFov = MathUtils.lerp(MathUtils.lerp(
    MathUtils.lerp(sampleFov(entrance, aspect) + focus * (6 + 5 * portrait), endFov, zoom),
    43 + 22 * portrait, conversation), 43 + 25 * portrait, printer);
  const t = travelProgress(journey);
  const pharmacy = pharmacyProgress(chapters);
  const mix = MathUtils.smoothstep(t, 0, .09);
  const arrival = MathUtils.smoothstep(t, .82, 1);
  const portraitDoorway = 5 * portrait * MathUtils.smoothstep(pharmacy, .066, .098)
    * (1 - MathUtils.smoothstep(pharmacy, .14, .183));
  const fov = MathUtils.lerp(MathUtils.lerp(existingFov, 46 + portrait * (16 - 7 * arrival), mix),
    53 + 16 * portrait + portraitDoorway, MathUtils.smoothstep(pharmacy, 0, .065));
  sampleCamera(entrance, aspect, eye);
  // Keep the camera on the centerline until it has cleared the entrance frame.
  eye.x += focus * (1.05 - .40 * settle) * (1 - MathUtils.smoothstep(eye.z, 3.05, 3.67));
  sampleLookAt(entrance, lookAt);
  const portraitLead = MathUtils.smoothstep(1 - aspect, 0, .4) * .42 * (1 - settle);
  lookAt.set(lookAt.x + focus * (1.28 + portraitLead - .50 * settle), lookAt.y + .17 * focus, lookAt.z);
  if (zoom > 0) {
    // Transition from the over-shoulder dolly to a readable view of the display.
    eye.lerp(screenApproach, MathUtils.smoothstep(zoom, 0, .64))
      .lerp(screenEye, MathUtils.smootherstep(zoom, .36, 1));
    lookAt.lerp(screenCenter, zoom);
  }
  if (story >= callStart) {
    eye.lerp(conversationEye, conversation);
    lookAt.lerp(conversationFocus, conversation);
  }
  eye.lerp(printerEye, printer);
  lookAt.lerp(printerFocus, printer);
  const portraitPrinter = MathUtils.smoothstep(1 - aspect, 0, .45) * printer;
  eye.set(eye.x + .12 * portraitPrinter, eye.y + .15 * portraitPrinter, eye.z + .45 * portraitPrinter);
  lookAt.set(lookAt.x + .15 * portraitPrinter, lookAt.y, lookAt.z);
  if (t > 0) {
    const frame = sampleTravel(t);
    walkCamera.getPointAt(frame.walk, tripView.eye);
    walkPose(frame.walk, tripView.target, tripView.tangent);
    tripView.target.setY(tripView.target.y + 1.23);
    const board = MathUtils.smoothstep(t, .41, .48);
    tripView.target.lerp(tripView.trackingTarget.set(-5.05, .99, 11.85), board);
    const follow = MathUtils.smoothstep(t, .527, .66);
    tripView.eye.lerp(tripView.trackingEye.set(frame.carX - 4.9 + 6.7 * arrival,
      3.28 + 1.8 * arrival + 1.5 * Math.sin(Math.PI * follow) + 2.5 * portrait * arrival,
      carLaneZ + 6.8 + 7.0 * arrival + 5 * portrait * arrival), follow);
    tripView.target.lerp(tripView.trackingTarget.set(frame.carX + .7 - .7 * arrival, .79 + 1.1 * arrival,
      carLaneZ - 2.45 * arrival), follow);
    eye.lerp(tripView.eye, mix);
    lookAt.lerp(tripView.target, mix);
  }
  if (pharmacy > 0) {
    samplePharmacyCamera(pharmacy, pharmacyFrame(pharmacy), tripView.eye, tripView.target);
    const establish = 1 - MathUtils.smoothstep(pharmacy, .005, .102);
    eye.copy(tripView.eye);
    eye.y += 2.5 * portrait * establish;
    eye.z += 5 * portrait * establish;
    lookAt.copy(tripView.target);
    // Stay behind the returning patient near the final living-room handoff.
    const roomApproach = MathUtils.smoothstep(pharmacy, .982, 1);
    eye.z += .26 * roomApproach;
    if (portrait > 0) {
      const counter = MathUtils.smoothstep(pharmacy, .184, .231) * (1 - MathUtils.smoothstep(pharmacy, .45, .488));
      eye.z += .43 * counter * portrait;
    }
  }
  moveDuringAction(storyProgress, eye, lookAt, tripView);
  return fov;
}
