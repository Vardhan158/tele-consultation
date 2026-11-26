import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, InstancedMesh, LineCurve3, MathUtils, Quaternion, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { beat, pulledChair } from './patientTimeline';
import { patientProgress } from './laptopTimeline';
import { bookingProgress, sampleCall } from './consultationTimeline';
import { earlierProgress, prescriptionFrame } from './prescriptionTimeline';
import { departureTrack, preTravelProgress, sampleTravel, travelProgress, travelStart, walkPose } from './travelTimeline';
import { homeEntry, bagCounter, counterPaper, pharmacyFrame, pharmacyProgress, pharmacyStart, previousJourney, samplePharmacyPatient } from './pharmacyTimeline';
import { bagOnTable, cupOnTable, finaleFrame, finaleProgress, finaleStart, sampleFinalePatient } from './finaleTimeline';
import { stanceAt, transferAt } from './characterMotion';
import calibration from './rigCalibration.json';
import ContactShadow from './ContactShadow';
import LaptopDisplay from './LaptopDisplay';

const approach = new Vector3(4.86, .19, 1.92);
const stoppingPoint = new Vector3(4.86, .19, -.80);
const chairPadTop = .608 + .061 / 2;
const seatedHipHeight = chairPadTop + .115;
const approachTrack = new LineCurve3(approach, stoppingPoint);
const tabletop = new Vector3(3.22, .952, -1.34);
const up = new Vector3(0, 1, 0);
const chairLeanAxis = new Vector3(0, 0, 1);
const level = new Quaternion();
// The hand bone points down its local Y axis toward the fingertips.
const palmUnderLaptop = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
function instanceLaptopKeys(model) {
  const keys = model.children.filter((mesh) => mesh.isMesh && /^Key(?:[._]?\d+)?$/.test(mesh.name));
  if (keys.length < 2) return;
  const [first] = keys;
  const instances = new InstancedMesh(first.geometry, first.material, keys.length);
  instances.name = 'Laptop keys';
  keys.forEach((key, index) => {
    key.updateMatrix();
    instances.setMatrixAt(index, key.matrix);
    key.removeFromParent();
  });
  instances.computeBoundingSphere();
  model.add(instances);
  return instances;
}

function updatePatientShadow(gl, rig, actor, progress) {
  const outdoors = actor.visible && actor.position.z > 4.15 && actor.position.x < 12 && actor.position.z < 14;
  const frame = outdoors ? Math.round(progress * 5000) : -1;
  if (frame === rig.shadowFrame) return;
  if (outdoors !== (rig.shadowFrame >= 0)) {
    rig.model.traverse((object) => {
      if (object.isMesh) object.castShadow = outdoors;
    });
  }
  rig.shadowFrame = frame;
  gl.shadowMap.needsUpdate = true;
}

const carHandle = (world) => world.getObjectByName('TravelDoor')?.getObjectByName('Handle');

// Aim each joint in world space while preserving the rig's local bone axes.
const from = new Vector3(), to = new Vector3(), origin = new Vector3();
const worldRotation = new Quaternion(), parentRotation = new Quaternion();
const delta = new Quaternion();
export function aim(bone, child, point, weight) {
  bone.getWorldPosition(origin);
  child.getWorldPosition(from).sub(origin).normalize();
  to.copy(point).sub(origin).normalize();
  delta.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(worldRotation).premultiply(delta);
  bone.parent.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.slerp(parentRotation.multiply(worldRotation), weight);
  bone.updateWorldMatrix(false, true);
}

const a = new Vector3(), b = new Vector3(), c = new Vector3();
const direction = new Vector3(), bend = new Vector3(), elbow = new Vector3(), end = new Vector3();
export function reach(chain, target, pole, weight) {
  if (weight <= 0) return;
  const [upper, lower, tip] = chain;
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  tip.getWorldPosition(c);
  const first = a.distanceTo(b), second = b.distanceTo(c);
  direction.copy(target).sub(a);
  const distance = MathUtils.clamp(direction.length(), Math.abs(first - second) + .002, first + second - .002);
  if (direction.lengthSq() < 1e-8) return;
  direction.normalize();
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-6) {
    // At a straight reach, retain the current elbow or knee plane.
    bend.copy(b).sub(a);
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 1e-6) return;
  }
  bend.normalize();
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  elbow.copy(a).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)));
  end.copy(a).addScaledVector(direction, distance);
  aim(upper, lower, elbow, weight);
  aim(lower, tip, end, weight);
}

// Orient the fixed hand mesh so the fingers extend over the short edge.
// Use the same edge offset during the lift, the walk and the pharmacy handoff.
function holdPrescription(sheet, wrist, heading, tilt, reachWeight, liftWeight) {
  const frame = sheetGripFrame.setFromAxisAngle(up, heading).multiply(
    sheetPitch.setFromAxisAngle(sheetRight, tilt));
  wrist.parent.getWorldQuaternion(parentRotation).invert();
  worldRotation.copy(parentRotation).multiply(frame).multiply(palmUnderLaptop);
  wrist.quaternion.slerp(worldRotation, reachWeight);
  wrist.getWorldPosition(origin);
  origin.add(to.set(0, -.012, .163).applyQuaternion(frame));
  sheet.position.lerp(origin, liftWeight);
  sheet.quaternion.slerp(worldRotation.copy(frame).multiply(sheetFacing), liftWeight);
}
const sheetGripFrame = new Quaternion(), sheetPitch = new Quaternion();
const cupGrip = new Quaternion().setFromAxisAngle(new Vector3(0,1,0), .25).multiply(palmUnderLaptop);
const sheetRight = new Vector3(1, 0, 0);
const sheetFacing = new Quaternion().setFromAxisAngle(up, Math.PI);

function sampleRig(rig, phase) {
  for (const [bone, sampled] of rig.rotations) bone.quaternion.copy(sampled);
  rig.hips.position.copy(rig.hipSample);
  rig.action.time = (phase % 1) * rig.clip.duration;
  rig.mixer.update(0);
  for (const [bone, sampled] of rig.rotations) sampled.copy(bone.quaternion);
  rig.hipSample.copy(rig.hips.position);
  rig.hips.position.x = rig.rest.x;
  rig.hips.position.z = rig.rest.z;
}

function plantFeet(actor, rig, scratch, weight) {
  if (weight <= 0) return;
  const heading = actor.rotation.y;
  scratch.pole.set(Math.sin(heading), 0, Math.cos(heading));
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const side = index ? -1 : 1;
    scratch.foot.set(side * .105, calibration.feet[index].ankle[1] - .032, side * .045).applyAxisAngle(up, heading).add(actor.position);
    reach(leg, scratch.foot, scratch.pole, weight);
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.fromArray(calibration.feet[index].toe).applyAxisAngle(up, heading));
    aim(leg[2], rig.toes[index], scratch.hand, weight);
  }
}

function lockWalkingFeet(rig, scratch, track, phase, cycles, strength) {
  if (!track || strength <= 0) return;
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const profile = calibration.feet[index];
    const { anchor, weight } = stanceAt(phase, profile);
    if (weight <= 0) continue;
    const at = MathUtils.clamp(anchor / cycles, 0, 1);
    track.getPointAt(at, scratch.support);
    track.getTangentAt(at, scratch.supportTangent);
    const heading = Math.atan2(scratch.supportTangent.x, scratch.supportTangent.z);
    scratch.pole.set(Math.sin(heading), 0, Math.cos(heading));
    scratch.foot.set(...profile.ankle, 0).applyAxisAngle(up, heading).add(scratch.support);
    reach(leg, scratch.foot, scratch.pole, strength * weight);
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.fromArray(profile.toe).applyAxisAngle(up, heading));
    aim(leg[2], rig.toes[index], scratch.hand, strength * weight);
  }
}

// All transfer targets are in sedan coordinates (+X forward, driver on -Z).
// Sample the same poses in reverse for an exit, including after the car turns.
function cabinTransfer(actor, rig, scratch, amount, car, outsideX, outsideZ, ground, outsideHeading) {
  const { tuck, inside, lean } = transferAt(amount);
  const lower = MathUtils.smoothstep(amount, .07, .53);
  const slide = MathUtils.smoothstep(amount, .26, .81);
  const turn = MathUtils.smoothstep(amount, .18, .89);
  actor.position.set(MathUtils.lerp(outsideX, .12, slide), ground,
    MathUtils.lerp(outsideZ, -.40, slide));
  actor.position.applyAxisAngle(up, car.heading);
  actor.position.x += car.carX;
  actor.position.z += car.carZ;
  actor.rotation.y = car.heading + outsideHeading +
    Math.atan2(Math.sin(Math.PI / 2 - outsideHeading), Math.cos(Math.PI / 2 - outsideHeading)) * turn;
  actor.updateWorldMatrix(true, true);
  rig.hips.getWorldPosition(scratch.hand);
  actor.position.y += (.71 - scratch.hand.y) * lower - .055 * lean;
  actor.updateWorldMatrix(true, true);
  rig.chest.getWorldPosition(scratch.hand);
  scratch.hand.add(scratch.foot.set(.24, -.23, .06).applyAxisAngle(up, car.heading));
  aim(rig.spine, rig.chest, scratch.hand, .88 * lean);
  rig.crown.getWorldPosition(scratch.hand);
  scratch.hand.add(scratch.foot.set(.22, -.15, 0).applyAxisAngle(up, car.heading));
  aim(rig.head, rig.crown, scratch.hand, .83 * lean);
  for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
    const phase = index ? tuck : inside;
    const side = index ? .105 : -.105;
    scratch.foot.set(MathUtils.lerp(outsideX + side, .54, phase),
      MathUtils.lerp(ground + .13, .465, phase) + .24 * Math.sin(Math.PI * phase),
      MathUtils.lerp(outsideZ, -.40 + side, phase)).applyAxisAngle(up, car.heading);
    scratch.foot.x += car.carX;
    scratch.foot.z += car.carZ;
    scratch.pole.set(1, .22, side).applyAxisAngle(up, car.heading);
    reach(leg, scratch.foot, scratch.pole, 1);
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.105,-.08,0).applyAxisAngle(up,car.heading));
    aim(leg[2],rig.toes[index],scratch.hand,phase);
  }
}

function pharmacyPose(t, actor, rig, scratch, scene) {
  const state = pharmacyFrame(t);
  const motion = samplePharmacyPatient(t, state, actor.position, scratch.tangent);
  actor.rotation.y = motion.heading;
  actor.visible = true;
  const paper = scene.getObjectByName('TravelPrescription');
  const bag = scene.getObjectByName('SealedBagStory');
  if (paper) paper.visible = (motion.visible && t < .268) || t >= .268;
  if (bag && state.carryBag) bag.visible = motion.visible;

  sampleRig(rig, motion.gait);
  actor.updateWorldMatrix(true, true);
  const transfer = t < .055 ? 1 - state.exit : t < .855 ? state.board : 1 - state.homeExit;
  if (t < .055 || t >= .611 && t < .898) {
    const returning = t >= .855;
    cabinTransfer(actor, rig, scratch, transfer, state, returning ? -.55 : -.48,
      returning ? -1.24 : -1.67, returning ? .02 : .04,
      t < .055 || returning ? Math.PI : 0);
    motion.heading = actor.rotation.y;
  }
  scratch.pole.set(0, -1, 0);
  scratch.hand.copy(actor.position).add(scratch.foot.set(.255, .90, .23).applyAxisAngle(up, motion.heading));
  scratch.hand.lerp(scratch.foot.set(counterPaper[0], 1.29, 4.43),
    state.offer * (1 - state.paperRelease));
  const receiveBag = MathUtils.smoothstep(t, .382, .416) * (1 - state.bagWithdraw);
  const offeringWrist = scene.getObjectByName('MedicineOfferingWrist');
  if (receiveBag > 0 && offeringWrist) {
    offeringWrist.getWorldPosition(scratch.foot);
    scratch.foot.z += .125;
    scratch.foot.y -= .02;
    scratch.hand.lerp(scratch.foot, receiveBag);
  }
  reach(rig.left, scratch.hand, scratch.pole, .96);
  const swing = .11 * Math.sin(motion.gait * Math.PI * 2);
  scratch.hand.copy(actor.position).add(scratch.foot.set(-.23, .82, .07 + swing).applyAxisAngle(up, motion.heading));
  reach(rig.right, scratch.hand, scratch.pole, .78);
  const doorContact = Math.max(
    MathUtils.smoothstep(t, 0, .009) * (1 - MathUtils.smoothstep(t, .058, .069)),
    MathUtils.smoothstep(t, .583, .591) * (1 - MathUtils.smoothstep(t, .651, .657)),
    MathUtils.smoothstep(t, .855, .861) * (1 - MathUtils.smoothstep(t, .900, .908)),
  );
  const hardware = carHandle(scene);
  if (doorContact > 0 && hardware) {
    hardware.getWorldPosition(scratch.hand);
    reach(rig.right, scratch.hand, scratch.pole, doorContact);
  }
  if (t > .95) {
    const grip = homeEntry(t).grip;
    const pull = scene.getObjectByName('EntranceDoor_Handle');
    if (grip && pull) {
      pull.getWorldPosition(scratch.hand);
      scratch.pole.set(.3,-1,.1);
      reach(rig.right,scratch.hand,scratch.pole,grip);
    }
  }
  const planted = Math.max(
    MathUtils.smoothstep(t, .205, .226) * (1 - MathUtils.smoothstep(t, .451, .474)),
    MathUtils.smoothstep(t, .585, .597) * (1 - MathUtils.smoothstep(t,.611,.623)),
    MathUtils.smoothstep(t, .987, 1),
  );
  const onFoot = Math.max(
    MathUtils.smoothstep(t, .055, .083) * (1 - MathUtils.smoothstep(t, .587, .611)),
    MathUtils.smoothstep(t, .903, .929) * (1 - MathUtils.smoothstep(t,.961,.966)) + MathUtils.smoothstep(t,.975,.982),
  );
  lockWalkingFeet(rig, scratch, motion.track, motion.gait, motion.cycles, onFoot * (1 - planted));
  plantFeet(actor, rig, scratch, planted);
  if (t >= .23 && t < .45) {
    rig.crown.getWorldPosition(scratch.hand);
    scratch.hand.z -= .06 * state.verify;
    aim(rig.head, rig.crown, scratch.hand, state.verify);
  }
  if (paper?.visible) {
    holdPrescription(paper, rig.left[2], motion.heading, .58 * (1 - state.offer), 1 - state.offer, 1);
    paper.quaternion.multiply(sheetFacing);
    const receivingWrist = scene.getObjectByName('PrescriptionReceivingWrist');
    if (receivingWrist && state.paperGrip > 0) {
      receivingWrist.getWorldPosition(scratch.hand);
      scratch.hand.z += .15;
      scratch.hand.y -= .012;
      paper.position.lerp(scratch.hand, state.paperGrip);
      paper.quaternion.slerp(level, state.paperGrip);
      paper.rotateX(-.23 * state.verify);
      paper.position.lerp(scratch.foot.set(counterPaper[0],counterPaper[1]+.003,3.98),state.paperSetDown);
    }
  }
  if (state.bagGrip > 0 && bag) {
    bag.visible = motion.visible;
    rig.left[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.02, -.216, .065).applyAxisAngle(up, motion.heading));
    // The bag passes smoothly from the worktop to the patient's grip.
    bag.position.lerp(scratch.hand, state.bagGrip);
    bag.rotation.set(0, motion.heading * state.bagWithdraw, .07 * Math.sin(motion.gait * Math.PI * 2));
  }
}

function finalePose(t, actor, rig, scratch, scene) {
  const state = finaleFrame(t);
  const motion = sampleFinalePatient(t, state, actor.position, scratch.tangent);
  actor.visible = true;
  actor.rotation.y = motion.heading;
  sampleRig(rig, motion.gait);
  actor.updateWorldMatrix(true, true);
  const { place, read, sip, holdCup, rest } = state;
  const sofaStance = MathUtils.smoothstep(t,.552,.568) * (1 - MathUtils.smoothstep(t,.843,.862));
  if (sofaStance > 0) {
    // Shift weight over the feet before lowering onto the center cushion.
    const weightShift = Math.sin(Math.PI * rest);
    rig.hips.getWorldPosition(scratch.hand);
    actor.position.y += (.930 - scratch.hand.y) * rest;
    actor.position.z -= .37 * rest - .055 * weightShift;
    actor.updateWorldMatrix(true,true);
    rig.chest.getWorldPosition(scratch.hand);
    scratch.hand.z += .20 * weightShift - .047 * rest;
    aim(rig.spine,rig.chest,scratch.hand,sofaStance);
  }
  const walking = Math.max(
    MathUtils.smoothstep(t, 0, .03) * (1 - MathUtils.smoothstep(t, .103, .13)),
    MathUtils.smoothstep(t, .445, .47) * (1 - MathUtils.smoothstep(t, .546, .572)),
    MathUtils.smoothstep(t, .855, .882) * (1 - MathUtils.smoothstep(t, .950, .976)),
  );
  lockWalkingFeet(rig, scratch, motion.track, motion.gait, motion.cycles, walking * (1 - rest));
  const standing = Math.max(
    MathUtils.smoothstep(t,.103,.130) * (1 - MathUtils.smoothstep(t,.427,.452)),
    MathUtils.smoothstep(t,.950,.976),
  );
  scratch.pole.set(0,-1,0);
  scratch.hand.copy(actor.position).add(scratch.foot.set(.24,.91,.21).applyAxisAngle(up,motion.heading));
  const bagReach = MathUtils.smoothstep(t,.116,.170) * (1 - MathUtils.smoothstep(t,.23,.275));
  scratch.hand.lerp(scratch.foot.set(bagOnTable[0],bagOnTable[1]+.235,bagOnTable[2]+.045),bagReach);
  if (rest > 0) scratch.hand.lerp(scratch.foot.set(4.65,.87,-2.82),rest);
  reach(rig.left,scratch.hand,scratch.pole,Math.max(.88 * (1 - place),bagReach,rest));

  if (rest > 0) {
    scratch.hand.set(4.24,.87,-2.80);
    reach(rig.right,scratch.hand,scratch.pole,rest);
  }
  rig.crown.getWorldPosition(scratch.hand);
  scratch.hand.z -= .087 * read + .025 * rest;
  scratch.hand.x += .04 * rest - .013 * read;
  aim(rig.head,rig.crown,scratch.hand,Math.max(read,rest));
  rig.head.rotateZ(.045 * read - .07 * rest);
  rig.spine.rotateX(.008 * rest * Math.sin(t * 82));

  for (const [index, leg] of [rig.leftLeg,rig.rightLeg].entries()) {
    scratch.pole.set(Math.sin(motion.heading),0,Math.cos(motion.heading));
    scratch.foot.set(index ? -.118 : .118,.095,.03).applyAxisAngle(up,motion.heading).add(actor.position);
    reach(leg,scratch.foot,scratch.pole,standing);
    if (sofaStance > 0) {
      const side = index ? -1 : 1;
      scratch.pole.set(side * .09,.08,1);
      scratch.foot.set(4.44 + side * .128,.213 + calibration.feet[index].ankle[1] - .032,
        -2.54 + side * .032);
      reach(leg,scratch.foot,scratch.pole,sofaStance);
    }
    leg[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.fromArray(calibration.feet[index].toe).applyAxisAngle(up,motion.heading));
    aim(leg[2],rig.toes[index],scratch.hand,Math.max(standing,sofaStance));
  }

  const bag = scene.getObjectByName('SealedBagStory');
  if (bag) {
    bag.visible = true;
    rig.left[2].getWorldPosition(scratch.hand);
    scratch.hand.add(scratch.foot.set(.02,-.216,.065).applyAxisAngle(up,motion.heading));
    bag.position.copy(scratch.hand).lerp(scratch.foot.set(...bagOnTable),place);
    bag.rotation.set(0,MathUtils.lerp(motion.heading,.07,place),.04 * (1 - place) * Math.sin(motion.gait * Math.PI * 2));
  }
  const cup = scene.getObjectByName('FinaleCup');
  if (cup && holdCup > 0) {
    // Lip landmark in the exported head bone's centimetre coordinates.
    rig.head.rotateX(.045 * sip - .18 * state.drinkTilt);
    rig.head.localToWorld(scratch.hand.set(.49, 8.62, 12.44));
    const pitch = -.64 * state.drinkTilt;
    cup.rotation.set(0, motion.heading, 0);
    cup.rotateX(pitch);
    // Pivot around the near edge of the rolled rim while tipping the cup.
    scratch.foot.set(0,.113,-.048).applyQuaternion(cup.quaternion);
    scratch.hand.sub(scratch.foot);
    cup.position.set(...cupOnTable).lerp(scratch.hand,sip);
    const arc = Math.sin(Math.PI * sip);
    cup.position.y += .072 * arc;
    cup.position.x += .045 * arc;
    // Keep the wrist outside the wall, with the fingers directed along its side.
    scratch.hand.set(-.048,.045,-.092).applyQuaternion(cup.quaternion).add(cup.position);
    scratch.pole.set(-.45,-.85,-.12).applyAxisAngle(up,motion.heading);
    reach(rig.right,scratch.hand,scratch.pole,holdCup);
    const wrist = rig.right[2];
    wrist.parent.getWorldQuaternion(parentRotation).invert();
    worldRotation.copy(parentRotation).multiply(cup.quaternion).multiply(cupGrip);
    wrist.quaternion.slerp(worldRotation,holdCup);

  }
}

function makePatientRig(scene, animations) {
    const model = clone(scene);
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
        if (object.isSkinnedMesh) object.frustumCulled = false;
      }
    });
    const bones = (names) => names.map((name) => model.getObjectByName(name));
    const mixer = new AnimationMixer(model);
    const clip = animations.find(({ name }) => name.toLowerCase().includes('walk'));
    const action = mixer.clipAction(clip).play();
    const [hips, spine, chest, head, crown, face] = bones(['Hips', 'Spine', 'Spine02', 'Head', 'head_end', 'headfront']);
    const left = bones(['LeftArm', 'LeftForeArm', 'LeftHand']);
    const right = bones(['RightArm', 'RightForeArm', 'RightHand']);
    const leftLeg = bones(['LeftUpLeg', 'LeftLeg', 'LeftFoot']);
    const rightLeg = bones(['RightUpLeg', 'RightLeg', 'RightFoot']);
    const toes = bones(['LeftToeBase', 'RightToeBase']);
    const rotations = [spine, chest, head, ...left, ...right, ...leftLeg, ...rightLeg].map((bone) => [bone, bone.quaternion.clone()]);
    return { model, shadowFrame: -1, mixer, action, clip, hips, rest: hips.position.clone(), hipSample: hips.position.clone(),
      spine, chest, head, crown, face, left, right, leftLeg, rightLeg, toes, rotations };
}

export default function PatientScene({ controller, finaleController, chair }) {
  const { scene, animations } = useGLTF('/assets/house/elderly_patient.glb', false);
  const { scene: laptopSource } = useGLTF('/assets/house/patient-laptop.glb', false);
  const body = useRef(null), prop = useRef(null), floorContact = useRef(null);
  const { scene: companionScene, animations: companionClips } = useGLTF('/assets/house/patient.glb', false);
  const companion = useRef(null);
  const companionRig = useMemo(() => makePatientRig(companionScene, companionClips), [companionScene, companionClips]);
  const rig = useMemo(() => makePatientRig(scene, animations), [scene, animations]);
  const laptop = useMemo(() => {
    const model = laptopSource.clone(true);
    const instances = instanceLaptopKeys(model);
    return { model, instances, hinge: model.getObjectByName('LaptopHinge') };
  }, [laptopSource]);
  useEffect(() => () => { laptop.instances?.dispose(); }, [laptop]);
  const scratch = useMemo(() => ({ carry: new Vector3(), hand: new Vector3(), pole: new Vector3(), foot: new Vector3(), path: new Vector3(), tangent: new Vector3(), support: new Vector3(), supportTangent: new Vector3() }), []);

  /* eslint-disable react-hooks/immutability -- The frame callback updates mutable Three.js scene objects. */
  useFrame(({ gl, scene: world }) => {
    const journey = previousJourney(controller.progress);
    const stage = preTravelProgress(journey);
    const departing = journey > travelStart;
    const travel = travelProgress(journey);
    const delivery = sampleTravel(travel);
    const story = earlierProgress(stage);
    const booking = bookingProgress(story);
    const progress = patientProgress(booking);
    const call = sampleCall(story);
    const prescription = prescriptionFrame(stage);
    if (!body.current || !prop.current) return;
    const actor = body.current;
    const helper = companion.current;
    helper.visible = false;
    const object = prop.current;
    if (controller.progress > pharmacyStart) {
      object.visible = true;
      object.position.copy(tabletop);
      object.rotation.set(0, 0, 0);
      laptop.hinge.rotation.z = 1.83;
      chair.position.setX(3.93 + pulledChair - .56 * .82);
      if (finaleController.progress > finaleStart) {
        const t = finaleProgress(finaleController.progress);
        finalePose(t, actor, rig, scratch, world);
        helper.visible = true;
        const advance = MathUtils.smoothstep(t,0,.075);
        helper.position.set(2.35 + .07 * advance,.19,1.05 - .48 * advance);
        helper.rotation.y = MathUtils.lerp(Math.atan2(.95,-1.25), Math.PI - .32, MathUtils.smoothstep(t,0,.042));
        sampleRig(companionRig,14 + .5 * advance);
        helper.updateWorldMatrix(true,true);
        plantFeet(helper, companionRig, scratch, advance);
        const offer = MathUtils.smoothstep(t,.025,.072);
        const receive = MathUtils.smoothstep(t,.055,.085);
        const release = MathUtils.smoothstep(t,.088,.116);
        const bag = world.getObjectByName('SealedBagStory');
        if (bag && t < .125) {
          scratch.pole.set(0,-1,.15);
          scratch.hand.set(.255,.90,.23).applyAxisAngle(up,helper.rotation.y).add(helper.position);
          scratch.hand.lerp(scratch.foot.set(2.54,1.26,.20),offer);
          reach(companionRig.left,scratch.hand,scratch.pole,1-release);
          companionRig.left[2].getWorldPosition(scratch.carry);
          scratch.carry.add(scratch.foot.set(.02,-.216,.065).applyAxisAngle(up,helper.rotation.y));
          scratch.hand.copy(scratch.carry).add(scratch.foot.set(.035,.19,-.075));
          reach(rig.left,scratch.hand,scratch.pole,receive*(1-release));
          rig.left[2].getWorldPosition(scratch.hand);
          scratch.hand.add(scratch.foot.set(.02,-.216,.065).applyAxisAngle(up,actor.rotation.y));
          bag.position.copy(scratch.carry).lerp(scratch.hand,release);
          bag.rotation.y = MathUtils.lerp(helper.rotation.y,actor.rotation.y,release);
        }
      } else {
        const returning = pharmacyProgress(controller.progress);
        actor.visible = returning > .92;
        if (actor.visible) {
          actor.position.set(2.55,.19,-.25);
          actor.rotation.y = 0;
          sampleRig(rig,0);
          actor.updateWorldMatrix(true,true);
          plantFeet(actor,rig,scratch,1);
        }
        pharmacyPose(pharmacyProgress(controller.progress), helper, companionRig, scratch, world);
        updatePatientShadow(gl, companionRig, helper, finaleController.progress);
      }
      updatePatientShadow(gl, rig, actor, finaleController.progress);
      return;
    }
    const walk = beat(progress, 'walk');
    const turn = beat(progress, 'turn');
    const pull = beat(progress, 'pull');
    const transfer = beat(progress, 'sit');
    const sit = MathUtils.smoothstep(transfer, .63, .98);
    const sitLean = MathUtils.smoothstep(transfer, .42, .63)
      * (1 - MathUtils.smoothstep(transfer, .81, 1));
    const place = beat(progress, 'place');
    const open = beat(progress, 'open');
    actor.visible = progress >= .63;
    object.visible = progress >= .63;
    const scoot = .56 * MathUtils.smoothstep(progress, .906, .929);
    chair.position.x = 3.93 + pulledChair * pull - scoot * .82;
    if (!actor.visible) {
      updatePatientShadow(gl, rig, actor, finaleController.progress);
      return;
    }

    actor.position.lerpVectors(approach, stoppingPoint, walk);
    actor.position.x += .14 * pull;
    // Step around the side of the pad before backing onto it.
    actor.position.x = MathUtils.lerp(actor.position.x, chair.position.x - .22,
      MathUtils.smoothstep(transfer, 0, .36));
    actor.position.z = MathUtils.lerp(actor.position.z, -1.29, MathUtils.smoothstep(transfer, .18, .54));
    actor.position.x += .17 * sit;
    actor.rotation.y = MathUtils.lerp(Math.PI, -Math.PI / 2 + Math.PI * 2, turn);

    sampleRig(rig, walk * 3);
    rig.hips.position.y = MathUtils.lerp(rig.hips.position.y, rig.rest.y, sit);
    actor.updateWorldMatrix(true, true);
    if (sit > 0) {
      rig.hips.getWorldPosition(scratch.hand);
      actor.position.y += (seatedHipHeight - scratch.hand.y) * sit;
      actor.updateWorldMatrix(true, true);
    }
    const settleFeet = MathUtils.smoothstep(progress, .778, .810) * (1 - sit);
    const walking = (1 - sit) * (1 - settleFeet);
    lockWalkingFeet(rig, scratch, approachTrack,
      walk * 3, 3, walking);
    plantFeet(actor, rig, scratch, settleFeet);
    // Hinge forward over the planted feet before lowering onto the seat.
    if (sitLean > 0) {
      rig.chest.getWorldPosition(scratch.foot);
      rig.spine.getWorldPosition(scratch.hand).sub(scratch.foot)
        .applyAxisAngle(chairLeanAxis, .42 * sitLean).add(scratch.foot);
      aim(rig.chest, rig.spine, scratch.hand, 1);
    }
    rig.chest.getWorldPosition(scratch.hand);
    scratch.hand.x -= .14 + .095 * Math.sin(Math.PI * open);
    aim(rig.spine, rig.chest, scratch.hand, place * (1 - .45 * open));
    const attend = MathUtils.smoothstep(progress, .905, .98) * sit;
    scratch.hand.set(3.20, 1.17, -1.34);
    aim(rig.head, rig.face, scratch.hand, .62 * attend);

    // The laptop begins in the left hand, then comes to rest on the tabletop.
    const gait = walk * 6 * Math.PI;
    const stride = Math.sin(Math.PI * walk) * (1 - sit);
    scratch.carry.set(.16, 1.015 + .012 * stride * Math.cos(2 * gait),
      .30 + .018 * stride * Math.sin(gait)).applyAxisAngle(up, actor.rotation.y).add(actor.position);
    object.position.copy(scratch.carry).lerp(tabletop, place);
    object.position.y += .075 * Math.sin(Math.PI * place);
    object.quaternion.setFromAxisAngle(up, actor.rotation.y).slerp(level, place);
    object.rotateX(-.055 * (1 - place));
    laptop.hinge.rotation.z = open * 1.83;

    const grip = beat(progress, 'grip') * (1 - sit);
    const hold = 1 - MathUtils.smoothstep(progress, .951, .961);
    // Support the near edge from below, then slide outboard before the base lands.
    const slide = MathUtils.smoothstep(place, .68, .98);
    scratch.hand.set(.10, -.033 + .048 * slide, -.175 - .14 * slide);
    object.localToWorld(scratch.hand);
    scratch.pole.set(.38, -1, -.25).applyAxisAngle(up, actor.rotation.y);
    reach(rig.left, scratch.hand, scratch.pole, hold);
    const wrist = rig.left[2];
    wrist.parent.getWorldQuaternion(parentRotation).invert();
    worldRotation.copy(parentRotation).multiply(object.quaternion).multiply(palmUnderLaptop);
    wrist.quaternion.slerp(worldRotation, hold);
    scratch.pole.set(0, -1, .16);
    scratch.hand.set(chair.position.x + .245, 1.105, -1.035);
    reach(rig.right, scratch.hand, scratch.pole, grip);
    laptop.hinge.localToWorld(scratch.hand.set(.221, .004, .093));
    scratch.hand.x += .035;
    scratch.hand.lerp(scratch.foot.set(3.39, .99, -1.24), MathUtils.smoothstep(progress, .986, 1));
    const lowerHand = MathUtils.smoothstep(booking, .735, .775);
    reach(rig.right, scratch.hand, scratch.pole, MathUtils.smoothstep(progress, .941, .966) * (1 - lowerHand));
    if (call.phase === 'active' && !prescription.phase) {
      rig.crown.getWorldPosition(scratch.hand);
      scratch.hand.x -= .034 + .045 * call.nod;
      scratch.hand.z += .022 * call.gesture;
      aim(rig.head, rig.crown, scratch.hand, 1);
      scratch.hand.set(3.58, .93 + .18 * call.gesture, -1.48 + .10 * call.gesture);
      reach(rig.right, scratch.hand, scratch.pole, call.gesture);
      rig.right[2].rotateX(-.19 * call.gesture);
    }
    if (prescription.reach > 0) {
      rig.chest.getWorldPosition(scratch.hand);
      scratch.hand.x -= .32 * prescription.reach * (1 - .56 * prescription.pickup);
      scratch.hand.z += .09 * prescription.reach;
      aim(rig.spine, rig.chest, scratch.hand, 1);
      scratch.hand.set(prescription.paperX + .163, prescription.paperY + .012 + .055 * Math.sin(Math.PI * prescription.reach), prescription.paperZ);
      reach(rig.left, scratch.hand, scratch.pole, prescription.reach);
      aim(rig.head, rig.face, scratch.hand, .68 * prescription.reach);
      scratch.hand.set(3.89, .79, -1.43);
      reach(rig.right, scratch.hand, scratch.pole, prescription.reach);
    }

    scratch.pole.set(-1, 0, 0);
    for (const [index, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
      const side = index ? -1 : 1;
      const step = MathUtils.smoothstep(transfer, index * .19, .35 + index * .19);
      const adjust = MathUtils.smoothstep(scoot / .56, index * .45, .55 + index * .45);
      const support = step;
      scratch.foot.set(4.49 - .38 - .56 * .82 * adjust + side * .025,
        .215 + calibration.feet[index].ankle[1] - .032 + .035 * Math.sin(Math.PI * adjust),
        -1.29 + side * .125);
      reach(leg, scratch.foot, scratch.pole, support);
      leg[2].getWorldPosition(scratch.hand);
      scratch.hand.add(scratch.foot.fromArray(calibration.feet[index].toe).applyAxisAngle(up, -Math.PI / 2));
      aim(leg[2], rig.toes[index], scratch.hand, support);
    }

    if (prescription.reach > 0) {
      const sheet = world.getObjectByName('TravelPrescription');
      if (sheet) holdPrescription(sheet, rig.left[2], actor.rotation.y,
        prescription.pickup * .22, prescription.reach, prescription.pickup);
    }
    if (stage >= .935) {
      helper.visible = true;
      const approach = MathUtils.smoothstep(stage, .935, .997);
      const walk = delivery.walk;
      const heading = walkPose(walk, scratch.path, scratch.tangent);
      const join = MathUtils.smoothstep(walk, 0, .12);
      helper.position.copy(scratch.path);
      helper.position.x += -.11 * (1 - join);
      helper.position.z += (.96 + 1.45 * (1 - approach)) * (1 - join);
      helper.rotation.y = Math.PI + Math.atan2(Math.sin(heading - Math.PI), Math.cos(heading - Math.PI)) * join;
      sampleRig(companionRig, approach * 2 + walk * 13);
      helper.updateWorldMatrix(true, true);
      lockWalkingFeet(companionRig, scratch, departureTrack, walk * 13, 13, join * (1 - delivery.enter));
      const waitingForPaper = MathUtils.smoothstep(approach,.88,1) * (1 - MathUtils.smoothstep(walk,0,.035));
      const waitingAtCar = MathUtils.smoothstep(travel,.424,.443) * (1 - MathUtils.smoothstep(travel,.479,.495));
      plantFeet(helper, companionRig, scratch, Math.max(waitingForPaper, waitingAtCar));
      if (delivery.enter > 0) {
        cabinTransfer(helper, companionRig, scratch, delivery.enter, delivery, -.54, -1.31, .025, heading);
      }
      const handle = carHandle(world);
      const contact = MathUtils.smoothstep(travel, .417, .434) * (1 - MathUtils.smoothstep(travel, .56, .585));
      if (handle && contact > 0) {
        handle.getWorldPosition(scratch.hand);
        scratch.pole.set(0,-1,-.2);
        reach(companionRig.right, scratch.hand, scratch.pole, contact);
      }
      const offer = MathUtils.smoothstep(travel, 0, .046);
      const grasp = MathUtils.smoothstep(travel, .036, .063);
      const release = MathUtils.smoothstep(travel, .067, .093);
      const sheet = world.getObjectByName('TravelPrescription');
      if (departing && sheet) {
        scratch.hand.set(3.75, 1.19, -.96);
        scratch.pole.set(-.25, -1, .25);
        reach(rig.left, scratch.hand, scratch.pole, offer * (1 - release));
        holdPrescription(sheet, rig.left[2], MathUtils.lerp(actor.rotation.y, 0, offer),
          .22 * (1 - offer), offer * (1 - release), offer);
        // Approach the opposite short edge while the giver still supports the page.
        scratch.hand.copy(sheet.position);
        scratch.hand.z += .163;
        scratch.hand.y += .012;
        scratch.foot.set(.23, 1.02, .25).applyAxisAngle(up, helper.rotation.y).add(helper.position);
        scratch.hand.lerp(scratch.foot, release);
        scratch.pole.set(-.3, -1, .15);
        reach(companionRig.left, scratch.hand, scratch.pole, grasp);
        if (release > 0) {
          scratch.foot.set(3.83, .89, -1.12);
          reach(rig.left, scratch.foot, scratch.pole, release);
        }
        // Keep the printed face's orientation as control passes to the opposite edge.
        sheet.quaternion.multiply(sheetFacing);
        holdPrescription(sheet, companionRig.left[2], helper.rotation.y, .58 * release, grasp, release);
        sheet.quaternion.multiply(sheetFacing);
      }
      updatePatientShadow(gl, companionRig, helper, finaleController.progress);
    }
    updatePatientShadow(gl, rig, actor, finaleController.progress);
  });
  useFrame(() => {
    if (!floorContact.current || !body.current) return;
    const subject = companion.current?.visible ? companion.current : body.current;
    const { position, visible } = subject;
    const inside = position.x > 1.65 && position.x < 6.4 && position.z < 3.8;
    const onRug = position.x > 1.99 && position.x < 5.82 && position.z > -3.07 && position.z < -.05;
    const inShop = position.x > 28 && position.z < 8.1;
    floorContact.current.visible = visible && (inside || inShop);
    floorContact.current.position.set(position.x, inShop ? .076 : onRug ? .215 : .185, position.z);
    floorContact.current.rotation.y = subject.rotation.y;
  });
  /* eslint-enable react-hooks/immutability */

  return <>
    <group ref={floorContact} visible={false}>
      <ContactShadow size={[.95, .82]} opacity={.40} />
    </group>
    <group ref={companion} visible={false}><primitive object={companionRig.model} dispose={null} /></group>
    <group ref={body} visible={false}><primitive object={rig.model} dispose={null} /></group>
    <group ref={prop} visible={false}><primitive object={laptop.model} dispose={null} /></group>
    <LaptopDisplay hinge={laptop.hinge} controller={controller} />
  </>;
}
