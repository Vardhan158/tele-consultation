# House exterior chapter

`StorySection` sits immediately after the existing hero. Its CSS sticky stage
provides the scroll runway; ScrollTrigger maps that runway to absolute progress.
The landing page's existing Lenis instance notifies ScrollTrigger, so there is no
second smooth-scroll instance or extra animation loop.

`StoryCanvas` is loaded near the viewport and remains mounted until the landing
page unmounts. It uses demand rendering and caps device pixel ratio at 1.5.
`CameraRig` is the sole camera owner; `cameraPath.js` contains its responsive path.
Scene modules must not create canvases, scroll listeners, or camera controls.
`HouseScene` loads the original house exterior GLB. The same scroll driver opens
the existing hinge before the camera crosses the threshold. `LivingRoom` loads
the separate, aligned `living-room.glb`, built with local Blender using
`frontend/scripts/house/build-living-room.py`.

Reduced motion collapses the runway and leaves a static camera. Canvas errors or
missing WebGL use a text fallback; all existing page content remains accessible.
ScrollTrigger, media-query contexts, observers, and subscriptions clean up on
unmount, including React Strict Mode remounts.

Validation: `npm run build`, `npx eslint src/components/public/story`, and
`npx playwright test tests/story-foundation.spec.js`. Browser tests use software
WebGL for remote desktops and CI.

## Model and extension points

`/assets/house/modern-house.glb` is original geometry authored with free Hosted
Higgsfield 3D Jutsu, project
https://higgsfield.ai/3d-jutsu/223421a0-f20d-4537-ae33-44ea8d7d89ed, revision 4.
Reproducible Blender construction steps are in `frontend/scripts/house/`:
`build-shell.py`, `detail-exterior.py`, then `final-contact.py`.

Units are metres, glTF Y-up; the front faces +Z. The 14 × 9 m building has a
hollow shell and a real entrance opening. The 2.4 m-wide approach rises 0.18 m
over 5.5 m to a level landing, with no stairs. The door leaf is 1.3 × 2.55 m.

- `EntranceDoor_Hinge`: `[0.75, 0.18, 4.30]`; local +Y rotation opens inward.
  Leaf, battens, handle, mounts and kickplate are its children. `sampleDoor`
  derives the hinge angle from absolute scroll progress.
- `InteriorAnchor`: `[1.4, 0.18, 3.3]`, behind the doorway for future rooms.
- `HERO_*`: separate shell elements. `DETAIL_*` and `GARDEN_*`: static geometry
  grouped by material. The door and interior anchor remain independently named.

## Delivery and resources

The delivery GLB is approximately 1.16 MB (source 4.82 MB), about 60k triangles,
with packed 256px textures, meshopt compression and WebP images. The bundled
Drei meshopt decoder needs no CDN. Geometry was not decimated, and named nodes
and empty anchors were preserved. Reproduce optimization with the free CLI:

```sh
npx --yes @gltf-transform/cli@4.5.1 optimize source.glb modern-house.glb --compress meshopt --flatten false --join false --instance false --palette false --prune false --simplify false --texture-compress webp --texture-size 256
```

Cached soft directional shadows refresh when the model/door changes, rather than
on every camera frame. The GLTF cache retains resources across route changes;
cloned scene graphs omit export lights/cameras so the app retains control.
`data-house-ready` on the Canvas supports model-load verification in browser tests.

`daylight.hdr` is the free CC0 **Rosendal Plains 2** by Dimitrios Savva and Jarod
Guest, https://polyhaven.com/a/rosendal_plains_2, license:
https://polyhaven.com/license. The local 1K map provides lighting and reflections
only. Actual geometry and a procedural sky render the visible scene. No paid
generation, GPU rental, external runtime asset request, image backdrop, or video is used.

Additional verification:

```sh
node --test tests/house-contract.test.js
npx playwright test tests/house-exterior.spec.js
```

The asset tests check embedded textures, size, hinge ownership and inward pivot,
interior anchor, camera continuity, reverse sampling, and exterior endpoint.
The browser test checks scroll progress and Canvas persistence on desktop and mobile.

The patient mesh, skeleton and walk cycle are from Grab3D's CC0 Man Base Mesh
(https://grab3d.com/models/characters/man-base-character/). `build-patient.py`
imports the source rig and models the laptop in Blender. The optimized character
uses Meshopt and 1K WebP textures. The original chair is a separate node in the
living room export. `patientTimeline.js` defines the shared scroll beats, and
`PatientScene` samples the walk cycle and interaction poses from absolute progress.

After the lid opens, `LaptopDisplay` renders the captured UI and cursor to a
single canvas texture on the display plane. `laptopTimeline.js` defines camera
and screen beats as absolute progress, so scrolling backward restores earlier
pages. The sequence uses only bundled WebP files and does not mount the live UI
or access appointment and payment services. To re-capture the UI, run the local
Vite server and `node scripts/house/capture-laptop-ui.mjs` from `frontend`.
The capture script uses Chromium, Python with Pillow, and fictional fixtures.

The consultation beat uses 36 local Blender renders packed into two WebP
atlases. The doctor is adapted from the CC0 Grab3D Woman Base Mesh
(https://grab3d.com/models/characters/woman-base-character/).
Run `render-demo-doctor.py` in Blender with the rigged GLB and a frame output
directory after `--`, then pass that directory to `pack-demo-doctor.py`.
The call interface is drawn onto the existing laptop texture. Its controls are
visual cues only. Doctor frames, patient gestures, and camera position all
follow the same scroll progress.

The printer and prescription were authored as separate roots in the free
Hosted 3D Jutsu project at https://higgsfield.ai/3d-jutsu/50afb786-3a08-4f63-bbb7-41720401390e.
`split-prescription-assets.py` extracts and batches the two props. The shipped
GLBs use Meshopt compression. Download and print are visual states on the laptop
texture, and the paper feed and pickup use absolute scroll progress.

The travel chapter uses the free Hosted 3D Jutsu asset project
https://higgsfield.ai/3d-jutsu/e8e47d07-f8d2-4ad4-a57f-aedf2d38888b.
The Meshopt GLB preserves separate pivots for the driver door and four wheels.
The patient uses the existing rig and walk clip and carries the existing paper.
The route follows the front entrance to the car, then tracks the car along the
street to its parking bay. That asset contains the exterior only.

The next chapter uses the free Hosted 3D Jutsu pharmacy interior and bag at
https://higgsfield.ai/3d-jutsu/9a1082d6-b30a-4a31-bb54-d40c75e610ca.
Its shell replaces the exterior model's solid storefront panels while keeping
the street, sign, and parking bay. The pharmacist uses a local Blender adaptation
of the CC0 Grab3D rig already used for the consultation. The paper and bag are
passed by scroll-driven poses. The drive and walk back reuse the existing car and
patient, ending inside the existing living room.

The finale adds the water cup and care-plan card from the free Hosted 3D Jutsu
project https://higgsfield.ai/3d-jutsu/40753ced-5823-4854-ac3c-184d7cadcb15.
The scroll samples drive bag placement, water, rest, time-of-day lighting and the
garden pullback on the original Canvas. The end-card link uses the existing
Find Doctors route and remains available in reduced-motion mode.

## Character motion calibration

Run `blender -b --python scripts/house/calibrate-motion.py` from the frontend
directory to regenerate the runtime walk contact data. The script samples the
existing walk action in Blender and inventories both character rigs. It leaves
the source GLBs intact. The runtime samples each stance at a fixed position
on the existing walking route, so scrubbing backward uses the same foot target.
The character exports expose wrist and head bones, but have no individual
finger controls, eyelids, or facial shape keys.
