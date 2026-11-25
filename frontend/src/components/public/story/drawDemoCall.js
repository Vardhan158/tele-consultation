function panel(ctx, x, y, width, height, fill, border) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 15);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.stroke();
  }
}

function label(ctx, value, x, y, size, color, weight = 600) {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function drawJoin(ctx) {
  panel(ctx, 314, 418, 332, 49, '#25836f');
  label(ctx, 'Join simulated consultation', 340, 449, 20, '#fff', 700);
}

export function drawDemoCall(ctx, state, atlas) {
  ctx.fillStyle = '#f0f5f7';
  ctx.fillRect(0, 0, 960, 624);
  label(ctx, 'Kaizen Care', 28, 42, 27, '#162623', 750);
  label(ctx, 'Video consultation · Dr. Asha Rao', 28, 73, 19, '#577877');
  panel(ctx, 705, 24, 226, 41, '#d9efe6');
  label(ctx, 'SIMULATED CALL', 735, 50, 18, '#145548', 750);
  panel(ctx, 28, 96, 904, 435, '#162623');
  if (state.phase === 'active') {
    const tile = state.frame % 18;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(28, 96, 904, 435, 15);
    ctx.clip();
    // Crop the feed to the player aperture while preserving facial and hand proportions.
    const sourceHeight = 480 * 435 / 904;
    ctx.drawImage(atlas, (tile % 6) * 480, Math.floor(tile / 6) * 270 + 15, 480, sourceHeight, 28, 96, 904, 435);
    ctx.restore();
    panel(ctx, 45, 476, 200, 38, '#162623');
    label(ctx, 'Dr. Asha Rao', 62, 502, 19, '#fff');
  } else {
    label(ctx, 'Joining the simulated consultation…', 244, 317, 26, '#fff', 650);
  }
  panel(ctx, 28, 544, 904, 62, '#fff', '#d3dedb');
  panel(ctx, 44, 555, 121, 40, '#fff', '#9baea9');
  panel(ctx, 178, 555, 148, 40, '#fff', '#9baea9');
  panel(ctx, 781, 555, 135, 40, '#be123c');
  label(ctx, 'Mic On', 72, 581, 20, '#162623');
  label(ctx, 'Camera On', 198, 581, 20, '#162623');
  label(ctx, 'Leave Call', 799, 581, 20, '#fff');
}
