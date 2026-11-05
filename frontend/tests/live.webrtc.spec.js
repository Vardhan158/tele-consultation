/* global process, Buffer */
/* eslint-disable no-async-promise-executor */
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const apiBase = 'https://127.0.0.1:8443';
const required = ['LIVE_ADMIN_EMAIL', 'LIVE_ADMIN_PASSWORD', 'LIVE_DOCTOR_EMAIL', 'LIVE_DOCTOR_PASSWORD', 'LIVE_PATIENT_EMAIL', 'LIVE_PATIENT_PASSWORD'];

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.alloc(Math.floor(bits.length / 8)); for (let i = 0; i < key.length; i += 1) key[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Math.floor(Date.now() / 1000 / 30); const data = Buffer.alloc(8); data.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(data).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

test('two authenticated browsers exchange fake WebRTC media over WSS', async ({ browser }) => {
  test.skip(required.some((name) => !process.env[name]), 'Set LIVE_* credentials to run the live integration test');
  const request = await (await import('@playwright/test')).request.newContext({ baseURL: apiBase, ignoreHTTPSErrors: true });
  const login = async (email, password, mfa_code) => { const response = await request.post('/auth/login', { data: { email, password, ...(mfa_code ? { mfa_code } : {}) } }); expect(response.ok()).toBeTruthy(); return response.json(); };
  await login(process.env.LIVE_ADMIN_EMAIL, process.env.LIVE_ADMIN_PASSWORD);
  const pending = await (await request.get('/doctor/pending')).json(); let candidate = pending.find((item) => item.full_name.includes('Integration')) || pending[0];
  if (candidate) { const approval = await request.post(`/doctor/${candidate.id}/approve`); expect(approval.ok()).toBeTruthy(); }
  else { await login(process.env.LIVE_PATIENT_EMAIL, process.env.LIVE_PATIENT_PASSWORD); const approvedDoctors = await (await request.get('/patient/doctors')).json(); candidate = approvedDoctors[0]; }
  expect(candidate).toBeTruthy();
  await login(process.env.LIVE_DOCTOR_EMAIL, process.env.LIVE_DOCTOR_PASSWORD);
  const enrollmentResponse = await request.post('/doctor/mfa/enroll'); expect(enrollmentResponse.ok()).toBeTruthy(); const enrollment = await enrollmentResponse.json();
  const code = totp(enrollment.secret); expect((await request.post('/doctor/mfa/verify', { data: { code } })).ok()).toBeTruthy(); await login(process.env.LIVE_DOCTOR_EMAIL, process.env.LIVE_DOCTOR_PASSWORD, totp(enrollment.secret));
  const start = new Date(Date.now() + 90_000); const end = new Date(start.getTime() + 30 * 60_000); expect((await request.post('/doctor/availability', { data: { starts_at: start.toISOString(), ends_at: end.toISOString() } })).ok()).toBeTruthy();
  await login(process.env.LIVE_PATIENT_EMAIL, process.env.LIVE_PATIENT_PASSWORD); const doctors = await (await request.get('/patient/doctors')).json(); const doctor = doctors.find((item) => item.id === candidate.id); expect(doctor).toBeTruthy();
  const booking = await request.post('/patient/appointments', { headers: { 'Idempotency-Key': `live-${Date.now()}` }, data: { doctor_id: doctor.id, starts_at: start.toISOString(), duration_minutes: 30 } }); expect(booking.ok()).toBeTruthy(); const appointment = await booking.json();
  const patientJoin = await request.post(`/patient/consultations/${appointment.id}/join`); expect(patientJoin.ok()).toBeTruthy(); const patientRoom = await patientJoin.json(); const patientState = await request.storageState();
  await login(process.env.LIVE_DOCTOR_EMAIL, process.env.LIVE_DOCTOR_PASSWORD, totp(enrollment.secret)); const doctorJoin = await request.post(`/doctor/consultations/${appointment.id}/join`); expect(doctorJoin.ok()).toBeTruthy(); const doctorRoom = await doctorJoin.json(); const doctorState = await request.storageState();
  const patientContext = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'] }); const doctorContext = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'] });
  await patientContext.addCookies(patientState.cookies.map((cookie) => ({ ...cookie, domain: '127.0.0.1' })));
  await doctorContext.addCookies(doctorState.cookies.map((cookie) => ({ ...cookie, domain: '127.0.0.1' })));
  const patientPage = await patientContext.newPage(); const doctorPage = await doctorContext.newPage(); await patientPage.goto('/'); await doctorPage.goto('/');
  const clientPath = fileURLToPath(new URL('../node_modules/socket.io-client/dist/socket.io.min.js', import.meta.url));
  await patientPage.addScriptTag({ path: clientPath }); await doctorPage.addScriptTag({ path: clientPath });
  const startPeer = (page, room, role) => page.evaluate(({ room, role, appointmentId }) => new Promise(async (resolve, reject) => { try { const state = { role, socket: 'created', signaling: '', ice: '', connection: '', tracks: [] }; window.__rtcState = state; const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); state.tracks = stream.getTracks().map((track) => track.kind); const socket = window.io('https://127.0.0.1:8443', { transports: ['websocket'], withCredentials: true, auth: { consultationToken: room.token, sessionId: room.session_id } }); const peer = new RTCPeerConnection({ iceServers: [] }); const pendingIce = []; stream.getTracks().forEach((track) => peer.addTrack(track, stream)); peer.ontrack = () => { window.__remoteTrack = true; resolve(true); }; peer.onsignalingstatechange = () => { state.signaling = peer.signalingState; }; peer.oniceconnectionstatechange = () => { state.ice = peer.iceConnectionState; }; peer.onconnectionstatechange = () => { state.connection = peer.connectionState; }; peer.onicecandidate = (event) => event.candidate && socket.emit('ice_candidate', { candidate: event.candidate }); const flushIce = async () => { while (pendingIce.length && peer.remoteDescription) await peer.addIceCandidate(pendingIce.shift()); }; socket.on('connect', () => { state.socket = 'connected'; socket.emit('join_room', { appointmentId, role }); socket.emit('signaling_ready'); if (role === 'doctor') setTimeout(() => socket.emit('admit_patient'), 500); }); socket.on('connect_error', (event) => { state.socket = `error:${event.message}`; }); socket.on('peer_ready', async () => { state.peerReady = true; if (role !== 'doctor') return; const offer = await peer.createOffer(); await peer.setLocalDescription(offer); socket.emit('offer', { offer }); }); socket.on('offer', async ({ offer }) => { state.offer = true; await peer.setRemoteDescription(offer); await flushIce(); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit('answer', { answer }); }); socket.on('answer', async ({ answer }) => { state.answer = true; await peer.setRemoteDescription(answer); await flushIce(); }); socket.on('ice_candidate', async ({ candidate }) => { if (peer.remoteDescription) await peer.addIceCandidate(candidate); else pendingIce.push(candidate); }); setTimeout(() => reject(new Error(`Timed out waiting for remote media track: ${JSON.stringify(state)}`)), 15000); } catch (error) { reject(error); } }), { room, role, appointmentId: appointment.id });
  const patientMedia = startPeer(patientPage, patientRoom, 'patient'); const doctorMedia = startPeer(doctorPage, doctorRoom, 'doctor'); await expect.poll(() => patientPage.evaluate(() => Boolean(window.__remoteTrack)), { timeout: 20_000 }).toBeTruthy(); await expect.poll(() => doctorPage.evaluate(() => Boolean(window.__remoteTrack)), { timeout: 20_000 }).toBeTruthy(); await Promise.all([patientMedia, doctorMedia]); await patientContext.close(); await doctorContext.close(); await request.dispose();
});
