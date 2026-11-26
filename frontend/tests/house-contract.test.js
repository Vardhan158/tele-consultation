import { easeStoryProgress, playbackProgress } from '../src/components/public/story/storyPlayback.js';
import { createCameraScratch, sampleJourneyCamera } from '../src/components/public/story/cameraJourney.js';
import { gaitContact, transferAt } from '../src/components/public/story/characterMotion.js';
import calibration from '../src/components/public/story/rigCalibration.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { sampleCamera, sampleDoor, sampleFov, sampleLookAt } from '../src/components/public/story/cameraPath.js';
import { pages, patientProgress, screenFrame } from '../src/components/public/story/laptopTimeline.js';
import { bookingProgress, sampleCall } from '../src/components/public/story/consultationTimeline.js';
import { earlierProgress, prescriptionFrame } from '../src/components/public/story/prescriptionTimeline.js';
import { sampleTravel, walkPose, wheelRadius } from '../src/components/public/story/travelTimeline.js';
import { pharmacyFrame, previousJourney, samplePharmacyPatient } from '../src/components/public/story/pharmacyTimeline.js';
import { finaleFrame, previousStory, sampleFinalePatient } from '../src/components/public/story/finaleTimeline.js';
import { sampleFinaleCamera } from '../src/components/public/story/finaleCamera.js';

const bytes = readFileSync(new URL('../public/assets/house/modern-house.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

test('care finale reverses from garden to rest, water and bag placement', () => {
  const samples = [0,.20,.26,.36,.52,.69,.81,.91,1];
  const pose = (t) => {
    const frame = finaleFrame(t);
    const position = new Vector3(), tangent = new Vector3();
    const actor = sampleFinalePatient(t, frame, position, tangent);
    for (const aspect of [.6, 1.6]) {
      const eye = new Vector3(), target = new Vector3();
      const fov = sampleFinaleCamera(t, aspect, eye, target);
      assert.ok([...eye.toArray(), ...target.toArray(), fov].every(Number.isFinite));
      if (eye.z > 3.65 && eye.z < 4.85) assert.ok(Math.abs(eye.x - 1.4) < .05);
    }
    return { frame, position: position.toArray(), actor };
  };
  const states = samples.map(pose);
  assert.equal(previousStory(.84), 1);
  assert.ok(states[1].frame.place > .75);
  assert.ok(states[2].frame.read > .9);
  assert.ok(states[3].frame.sip > .9);
  assert.ok(states[5].frame.dusk > .9 && states[5].frame.rest > .9);
  assert.ok(states[8].position[2] > 7);
  assert.deepEqual(samples.toReversed().map(pose), states.toReversed());
});

test('pharmacy exchange, return and home arrival are reversible', () => {
  const samples = [0,.125,.26,.34,.414,.44,.625,.75,.86,.979,1];
  const pose = (t) => {
    const frame = pharmacyFrame(t);
    const origin = new Vector3();
    const actor = samplePharmacyPatient(t, frame, origin, new Vector3());
    return { frame, origin: origin.toArray(), actor };
  };
  const states = samples.map(pose);
  assert.equal(previousJourney(.76), 1);
  assert.equal(states[1].frame.shopDoor, 1);
  assert.ok(states[2].frame.offer > 0);
  assert.ok(states[3].frame.verify > .9);
  assert.ok(states[4].frame.handoff > 0);
  assert.equal(states[5].frame.carryBag, true);
  assert.ok(states[6].frame.board > 0);
  assert.equal(states[7].actor.visible, false);
  assert.equal(states[8].frame.carX, -5);
  assert.ok(states[10].origin[2] < 3.3);
  assert.deepEqual(samples.toReversed().map(pose), states.toReversed());
});

test('pharmacy travel has a reversible boarding and rolling sequence', () => {
  const checkpoints = [0, .47, .52, .59, .8, 1];
  const frames = checkpoints.map(sampleTravel);
  assert.ok(frames[1].door > 0);
  assert.ok(frames[2].enter > 0 && frames[2].enter < 1);
  assert.equal(frames[3].door, 0);
  assert.equal(frames[3].carX, frames[0].carX);
  assert.equal(frames[5].carX, 32);
  assert.equal(frames[5].parked, true);
  assert.ok(Math.abs((frames[4].carX - frames[0].carX) + frames[4].wheel * wheelRadius) < 1e-6);
  assert.deepEqual(checkpoints.toReversed().map(sampleTravel), frames.toReversed());
  const pos = new Vector3(), tangent = new Vector3();
  for (let i = 0; i <= 100; i++) {
    walkPose(i / 100, pos, tangent);
    if (pos.z > 3.6 && pos.z < 4.9) assert.ok(Math.abs(pos.x - 1.4) < .18);
  }
});

test('travel export keeps its animated pivots and vehicle glazing', () => {
  const asset = readFileSync(new URL('../public/assets/house/pharmacy-travel.glb', import.meta.url));
  const contents = JSON.parse(asset.subarray(20, 20 + asset.readUInt32LE(12)).toString());
  const nodes = new Map(contents.nodes.map((node) => [node.name, node]));
  const car = nodes.get('TravelCar');
  const door = nodes.get('TravelDoor');
  assert.ok(asset.length < 500_000);
  for (const name of ['TravelDoor', 'TravelWheel00', 'TravelWheel01', 'TravelWheel10', 'TravelWheel11']) {
    assert.ok(car.children.some((index) => contents.nodes[index].name === name));
  }
  assert.ok(door.children.some((index) => contents.nodes[index].name === 'Driver window'));
  assert.notEqual(nodes.get('Laminated windshield')?.mesh, undefined);
  assert.ok(nodes.has('PharmacyStreet'));
});

test('prescription timeline feeds the paper before lifting it and scrubs backward', () => {
  const checkpoints = [.77, .8, .85, .89, .93, .95, 1];
  const frames = checkpoints.map(prescriptionFrame);
  assert.equal(earlierProgress(.79), 1);
  assert.deepEqual(frames.map(({ phase }) => phase), [null, 'ended', 'prescription', 'downloaded', 'printing', 'printed', 'printed']);
  assert.ok(frames[4].feed > 0 && frames[4].feed < 1);
  assert.equal(frames[5].pickup, 0);
  assert.ok(frames[6].paperY > frames[5].paperY);
  assert.deepEqual(checkpoints.toReversed().map(prescriptionFrame), frames.toReversed());
});

test('demo consultation reverses from the last doctor frame to booking', () => {
  assert.equal(bookingProgress(.8), 1);
  assert.equal(sampleCall(1).frame, 35);
  assert.ok(sampleCall(.97).gesture > 0);
  assert.equal(sampleCall(.88).phase, 'active');
  assert.equal(sampleCall(.86).phase, 'connecting');
  assert.equal(sampleCall(.84).phase, 'booking');
  assert.equal(sampleCall(.78).join, 0);
  for (const index of [0, 1]) {
    const atlas = readFileSync(new URL(`../public/assets/house/laptop-ui/doctor-${index}.webp`, import.meta.url));
    assert.equal(atlas.toString('ascii', 8, 12), 'WEBP');
    assert.ok(atlas.length < 100_000);
  }
});

test('booking screen frames and click cues follow absolute scroll progress', () => {
  assert.equal(screenFrame(.70).power, 0);
  assert.equal(patientProgress(.72), 1);
  assert.equal(screenFrame(.79).power, 1);
  for (const [index, page] of pages.entries()) {
    assert.equal(screenFrame(page.start).index, index);
    if (page.click) {
      assert.equal(screenFrame(page.click).cursor, 1);
      assert.equal(screenFrame(page.click).click, 1);
      assert.equal(screenFrame(page.click).index, index);
    }
    const texture = readFileSync(new URL(`../public/assets/house/laptop-ui/${page.name}.webp`, import.meta.url));
    assert.equal(texture.toString('ascii', 8, 12), 'WEBP');
    assert.ok(texture.length < 65_000);
  }
  for (let index = pages.length - 1; index >= 0; index--) assert.equal(screenFrame(pages[index].start).index, index);
});

test('portable model retains an independent hinged door and interior anchor', () => {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.ok(bytes.length < 2_000_000, 'model exceeds the 2 MB delivery budget');
  assert.ok(gltf.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.ok(gltf.images.every((image) => image.bufferView !== undefined), 'textures must be embedded');
  const objects = gltf.nodes.map((node) => {
    const object = new Object3D();
    object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node, i) => node.children?.forEach((child) => objects[i].add(objects[child])));
  const hinge = objects.find((object) => object.name === 'EntranceDoor_Hinge');
  const leaf = objects.find((object) => object.name === 'EntranceDoor_Leaf');
  const wall = objects.find((object) => object.name === 'HERO_entry_jamb_left');
  const anchor = objects.find((object) => object.name === 'InteriorAnchor');
  assert.ok(hinge && leaf && wall && anchor);
  assert.equal(leaf.parent, hinge);
  assert.ok(hinge.children.some((child) => child.name === 'EntranceDoor_Handle'));
  const closed = leaf.getWorldPosition(new Vector3());
  const wallBefore = wall.getWorldPosition(new Vector3());
  hinge.rotation.y = Math.PI / 2;
  const opened = leaf.getWorldPosition(new Vector3());
  assert.ok(opened.z < closed.z - 0.5, 'door must open inward around the hinge');
  assert.deepEqual(wall.getWorldPosition(new Vector3()), wallBefore);
  assert.ok(anchor.position.z < hinge.position.z, 'interior anchor must be behind the doorway');
});

test('reversible camera clears the open door and frames the table on desktop and mobile', () => {
  for (const aspect of [0.6, 1, 1.6, 2.3]) {
    const poses = [];
    for (let i = 0; i <= 100; i++) {
      const pose = sampleCamera(i / 100, aspect, new Vector3());
      assert.ok(pose.toArray().every(Number.isFinite));
      assert.ok(pose.y >= 1.55 && pose.y <= 12);
      if (pose.z < 4.65 && pose.z > 3.05) {
        assert.equal(sampleDoor(i / 100), Math.PI / 2);
        assert.ok(pose.x >= 1.35 && pose.x <= 1.65, 'camera must clear both jambs and the hinge');
      }
      if (i) assert.ok(pose.distanceTo(poses[i - 1]) < 1.2, 'camera jumped');
      poses.push(pose);
    }
    for (let i = 100; i >= 0; i--) assert.deepEqual(sampleCamera(i / 100, aspect, new Vector3()), poses[i]);
    assert.ok(poses[0].distanceTo(sampleLookAt(0, new Vector3())) > poses[100].distanceTo(sampleLookAt(1, new Vector3())));
    const camera = new PerspectiveCamera(sampleFov(1, aspect), aspect, 0.045, 180);
    camera.position.copy(poses[100]);
    camera.lookAt(sampleLookAt(1, new Vector3()));
    camera.updateMatrixWorld();
    for (const x of [1.825, 3.475]) for (const z of [-1.73, -.77]) {
      const corner = new Vector3(x, .949, z).project(camera);
      assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, `table crops at aspect ${aspect}`);
    }
  }
  assert.equal(sampleDoor(0), 0);
  assert.equal(sampleDoor(1), Math.PI / 2);
});

test('shoe anchors stay fixed through stance and bridge continuously across swing and wrap', () => {
  for (const foot of calibration.feet) {
    const center = foot.center + 2;
    const phases = [center - .20, center, center + .20];
    const contact = phases.map((phase) => gaitContact(phase, foot));
    assert.ok(contact.every(({ from, to, swing }) => Math.abs(from - center) < 1e-8 && to === from && swing === 0));
    assert.deepEqual(phases.toReversed().map((phase) => gaitContact(phase, foot)), contact.toReversed());
    const midSwing = gaitContact(center + .5, foot);
    assert.ok(Math.abs(midSwing.from - center) < 1e-8);
    assert.ok(Math.abs(midSwing.to - center - 1) < 1e-8);
    assert.ok(Math.abs(midSwing.swing - .5) < 1e-8);
    const stanceEnd = center + foot.halfWidth + .018;
    assert.ok(gaitContact(stanceEnd + 1e-7, foot).swing < 1e-6);
    const nextContact = center + 1 - foot.halfWidth - .018;
    assert.ok(gaitContact(nextContact - 1e-7, foot).swing > .999999);
  }
  assert.equal(gaitContact(.98, calibration.feet[1]).from, 1.05);
  assert.deepEqual(transferAt(0), { tuck: 0, inside: 0, lean: 0 });
  assert.equal(transferAt(1).inside, 1);
});

test('journey camera stays clear of thresholds and continuous across orientation changes', () => {
  const scratch = createCameraScratch();
  const sample = (p, aspect) => {
    const eye = new Vector3();
    const target = new Vector3();
    const fov = sampleJourneyCamera(p, aspect, eye, target, scratch);
    return { eye, direction: target.sub(eye), fov };
  };
  for (const aspect of [.42, .503, 1, 1.778]) {
    let previous = sample(0, aspect);
    for (let i = 1; i <= 10000; i++) {
      const p = i / 10000;
      const pose = sample(p, aspect);
      const { eye, direction, fov } = pose;
      assert.ok(direction.length() > .42, `View target approaches the lens at ${p}`);
      assert.ok(eye.y > 1.1 && fov > 28 && fov < 105);
      assert.ok(previous.eye.distanceTo(eye) < .55, `Dolly jumps at ${p}`);
      assert.ok(previous.direction.angleTo(direction) < .1, `View spins at ${p}`);
      assert.ok(Math.abs(previous.fov - fov) < .32, `Lens jumps at ${p}`);
      if (eye.z > 4.18 && eye.z < 4.52 && eye.x < 7) assert.ok(Math.abs(eye.x - 1.4) < .13);
      if (eye.z > 8.05 && eye.z < 8.32 && eye.x > 20) assert.ok(Math.abs(eye.x - 32) < .13);
      previous = pose;
    }
    const checkpoints = [0, .106, .259, .451, .638, .744, .839, .898, .989, 1];
    const forward = checkpoints.map((p) => sample(p, aspect));
    const reverse = checkpoints.toReversed().map((p) => sample(p, aspect));
    assert.deepEqual(reverse, forward.toReversed());
  }
  for (const p of [.15, .35, .61, .65, .744, .96, .998]) {
    const almostSquare = sample(p, .9999);
    const square = sample(p, 1);
    assert.ok(almostSquare.eye.distanceTo(square.eye) < .004);
    assert.ok(Math.abs(almostSquare.fov - square.fov) < .005);
  }
});

test('garden follow camera keeps clearance from the walking patient', () => {
  const eye = new Vector3(), target = new Vector3(), actor = new Vector3(), tangent = new Vector3();
  for (const aspect of [.42, 1, 1.778]) {
    for (let i = 899; i <= 951; i++) {
      const t = i / 1000;
      sampleFinaleCamera(t, aspect, eye, target);
      sampleFinalePatient(t, finaleFrame(t), actor, tangent);
      assert.ok(Math.hypot(eye.x - actor.x, eye.z - actor.z) > .70, `Camera approaches the patient at ${t}`);
    }
  }
});


test('story scrub follows the stethoscope easing in either direction and preserves reduced-motion stills', () => {
  const frame = 1000 / 60;
  assert.ok(Math.abs(easeStoryProgress(0, 1, frame) - .075) < 1e-10);
  const first = easeStoryProgress(.2, .8, frame / 2);
  assert.ok(Math.abs(easeStoryProgress(first, .8, frame / 2) - easeStoryProgress(.2, .8, frame)) < 1e-10);
  let progress = .8;
  for (let i = 0; i < 120; i++) {
    const next = easeStoryProgress(progress, .2, frame);
    assert.ok(next <= progress && next >= .2);
    progress = next;
  }
  assert.equal(progress, .2);
  assert.equal(playbackProgress(.54, true), .638);
  assert.equal(playbackProgress(.54, false), .54);
});

test('camera travels while the door, laptop, printer and car actions play', () => {
  const scratch = createCameraScratch();
  const eye = new Vector3(), target = new Vector3();
  for (const aspect of [1.6, .503]) {
    for (const [start, end] of [[.095,.109], [.172,.187], [.204,.22], [.252,.34], [.41,.43], [.46,.483], [.555,.565]]) {
      sampleJourneyCamera(start, aspect, eye, target, scratch);
      const before = eye.clone();
      sampleJourneyCamera(end, aspect, eye, target, scratch);
      assert.ok(eye.distanceTo(before) > .002, `Camera holds between ${start} and ${end} at aspect ${aspect}`);
    }
  }
});
