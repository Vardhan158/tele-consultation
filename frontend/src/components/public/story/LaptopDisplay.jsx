import { useEffect, useMemo } from 'react';
import { createPortal, useFrame, useLoader } from '@react-three/fiber';
import { CanvasTexture, ImageLoader, MathUtils, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { pages, screenFrame } from './laptopTimeline';
import targets from './laptopTargets.json';
import { bookingProgress, joinStart, joinClick, sampleCall } from './consultationTimeline';
import { drawDemoCall, drawJoin } from './drawDemoCall';
import { earlierProgress, prescriptionFrame } from './prescriptionTimeline';
import { drawPrescription } from './drawPrescription';
import { preTravelProgress } from './travelTimeline';
import { previousJourney } from './pharmacyTimeline';

const urls = pages.map(({ name }) => `/assets/house/laptop-ui/${name}.webp`);
urls.push('/assets/house/laptop-ui/doctor-0.webp', '/assets/house/laptop-ui/doctor-1.webp');

function drawCursor(context, x, y, click) {
  if (click > 0) {
    context.beginPath();
    context.arc(x, y, 12 + click * 9, 0, Math.PI * 2);
    context.strokeStyle = `rgba(37,131,111,${click})`;
    context.lineWidth = 4;
    context.stroke();
  }
  context.save();
  context.translate(x, y);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 28);
  context.lineTo(7, 20);
  context.lineTo(13, 31);
  context.lineTo(18, 28);
  context.lineTo(12, 17);
  context.lineTo(24, 17);
  context.closePath();
  context.lineJoin = 'round';
  context.lineWidth = 2;
  context.fillStyle = 'white';
  context.strokeStyle = '#162623';
  context.fill();
  context.stroke();
  context.restore();
}

export default function LaptopDisplay({ hinge, controller }) {
  const frames = useLoader(ImageLoader, urls);
  const surface = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 624;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: texture, color: 0x000000, toneMapped: false });
    const geometry = new PlaneGeometry(.310, .201);
    // Display coordinates: screen right is -Z and screen up is +X in lid space.
    geometry.rotateZ(-Math.PI / 2).rotateX(Math.PI / 2);
    return { canvas, context: canvas.getContext('2d'), texture, material, geometry, last: '' };
  }, []);
  useEffect(() => () => {
    surface.texture.dispose();
    surface.material.dispose();
    surface.geometry.dispose();
  }, [surface]);

  /* eslint-disable react-hooks/immutability -- Three.js texture updates are imperative. */
  useFrame(() => {
    const stage = preTravelProgress(previousJourney(controller.progress));
    const progress = earlierProgress(stage);
    const prescription = prescriptionFrame(stage);
    const call = sampleCall(progress);
    const { index, cursor, click, power } = screenFrame(bookingProgress(progress));
    surface.material.color.setScalar(.018 + .982 * power);
    const key = prescription.phase ? `${prescription.phase}:${Math.round(prescription.cursor * 160)}:${Math.round(prescription.printCursor * 160)}` : call.phase === 'booking'
      ? `${index}:${Math.round(cursor * 160)}:${Math.round(click * 20)}:${progress >= joinStart}:${Math.round(call.join * 160)}:${Math.round(Math.max(0, 1 - Math.abs(progress - joinClick) / .005) * 20)}`
      : `${call.phase}:${call.frame}`;
    if (!power || surface.last === key) return;
    surface.last = key;
    const { canvas, context } = surface;
    if (prescription.phase) {
      drawPrescription(context, prescription);
      if (prescription.phase === 'prescription') {
        drawCursor(context, MathUtils.lerp(456, 578, prescription.cursor), MathUtils.lerp(414, 542, prescription.cursor), prescription.cursor ** 20);
      } else if (prescription.phase === 'downloaded') {
        drawCursor(context, MathUtils.lerp(578, 814, prescription.printCursor), 542, prescription.printCursor ** 20);
      }
    } else if (call.phase !== 'booking') {
      drawDemoCall(context, call, frames[pages.length + Math.floor(call.frame / 18)]);
    } else {
      context.drawImage(frames[index], 0, 0, canvas.width, canvas.height);
      if (progress >= joinStart) {
        drawJoin(context);
        drawCursor(context, MathUtils.lerp(660, 480, call.join),
          MathUtils.lerp(460, 442, call.join), 1 - Math.min(1, Math.abs(progress - joinClick) / .005));
      } else {
        const current = targets[pages[index].name];
        if (current) {
          const previous = index > 0 ? targets[pages[index - 1].name] : [.50, .54];
          drawCursor(context, MathUtils.lerp(previous[0], current[0], cursor) * canvas.width,
            MathUtils.lerp(previous[1], current[1], cursor) * canvas.height, click);
        }
      }
    }
    surface.texture.needsUpdate = true;
  });
  /* eslint-enable react-hooks/immutability */

  return createPortal(<mesh position={[.112, -.0016, 0]} geometry={surface.geometry} material={surface.material} />, hinge);
}
