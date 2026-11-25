function box(ctx, x, y, w, h, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx, message, x, y, size, color = '#162623', weight = 500) {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(message, x, y);
}

export function drawPrescription(ctx, { phase }) {
  box(ctx, -15, -15, 990, 654, '#eef5f3');
  text(ctx, 'Kaizen Care', 36, 52, 32, '#162623', 750);
  box(ctx, 744, 19, 181, 43, '#d9eee5');
  text(ctx, 'DEMO ONLY', 782, 47, 20, '#145548', 750);
  box(ctx, 36, 92, 888, 386, '#fff');
  if (phase === 'ended') {
    text(ctx, 'Consultation ended', 88, 205, 38, '#162623', 750);
    text(ctx, 'Dr. Asha Rao has ended the simulated call.', 88, 258, 25, '#577877');
    return;
  }
  text(ctx, 'Digital prescription', 76, 164, 38, '#162623', 750);
  text(ctx, 'Dr. Asha Rao  /  Demo Patient', 76, 220, 25, '#577877');
  box(ctx, 76, 251, 805, 2, '#dce9e4');
  text(ctx, 'Consultation summary', 76, 310, 25, '#145548', 700);
  text(ctx, 'No medication was prescribed.', 76, 354, 23);
  text(ctx, 'For demonstration only.', 76, 418, 22, '#577877');
  const downloaded = phase !== 'prescription';
  box(ctx, 452, 513, 253, 57, downloaded ? '#d9eee5' : '#25836f');
  text(ctx, downloaded ? 'Demo copy ready' : 'Download demo copy', 474, 548, 20, downloaded ? '#145548' : '#fff', 700);
  box(ctx, 722, 513, 202, 57, downloaded ? '#25836f' : '#dde8e5');
  text(ctx, phase === 'printing' ? 'Printing…' : phase === 'printed' ? 'Demo printed' : 'Print demo copy', 737, 548, 20, downloaded ? '#fff' : '#577877', 700);
}
