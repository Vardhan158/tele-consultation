# Character motion and facial review

The production build and all 14 story contract tests passed. Chrome playback and a separate browser audit used the same build. The audit sampled 359 poses from the entrance through the garden exit and recorded zero page errors. The dense audit omitted browser rasterization during measurement. The WebM is an actual Chrome screen recording with rendering enabled.

| Area | Result |
| --- | --- |
| Skin detail | Both exports contain 2048 × 2048 face color and pore normal maps. |
| Expressions | Blender and Chrome verified the blink, soft smile, and focus morphs on the shipped rigs. |
| Eyes | Both Cycles close-ups show individual iris detail, upper-lid shading, and catchlights over a shallow corneal curve. |
| Age cues | The elderly face has stronger pore contrast, pigmentation variation, wrinkles, and softer jowls. The younger companion retains smoother skin and brown hair. |
| Foot sliding | The largest horizontal drift in the sampled indoor walking stances was 0.01 mm. |
| Floor contact | Worst sampled outsole penetration was 0.96 mm indoors and 2.68 mm on the departure, pharmacy, home, and garden routes. The standing cup pose had a maximum measured sole error of 0.04 mm on the rug. |
| Body clipping | The approach now routes in front of the chair before shifting sideways and lowering onto the cushion. The browser probe found zero shin centerline intersections with the seat in the sampled frames. |
| Body movement | The first and last steps ease in and out. Walking swings bridge fixed contacts, and the turn and chair approach move one foot at a time. |

The faces still read as computer-generated in close-up. The floor and chair measurements apply to the sampled poses and surfaces. The chair probe does not establish clearance for every part of both bodies against every prop throughout the story.

[Chrome playback](browser-playback.webm) · [Interior motion measurements](motion-verification.json) · [Walking-surface measurements](exterior-verification.json) · [Blender asset verification](blender-verification.txt)

[Elderly face render](elderly_patient_face_cycles.png) · [Companion face render](companion_face_cycles.png)

The editable Blender files include all three facial expression sliders. Pass the two pre-expression GLBs from commit `eb5d52e` as a directory after the repository and output arguments when rerunning [refine_faces.py](refine_faces.py) on a newer checkout.
