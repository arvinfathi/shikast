// src/lib/midi.js
// Simple WebMIDI initializer. Exports a function that accepts a callback(note, velocity).
// Call initMIDI(onNote) where onNote(note, velocity) runs on MIDI NoteOn.

export default async function initMIDI(onNoteCallback) {
  if (!navigator.requestMIDIAccess) {
    throw new Error("WebMIDI is not supported in this browser (use Chrome/Edge).");
  }
  const access = await navigator.requestMIDIAccess();
  // Attach to already connected inputs
  for (const input of access.inputs.values()) {
    input.onmidimessage = (msg) => handleMessage(msg, onNoteCallback);
  }
  // Attach to future device state changes
  access.onstatechange = (ev) => {
    // when device connects attach handler
    if (ev.port?.type === "input" && ev.port.state === "connected") {
      ev.port.onmidimessage = (msg) => handleMessage(msg, onNoteCallback);
    }
  };
  return access;
}

function handleMessage(e, cb) {
  const [status, data1, data2] = e.data;
  const cmd = status & 0xf0;
  const channel = status & 0x0f;
  // Note On
  if (cmd === 0x90 && data2 > 0) {
    const note = data1;
    const velocity = data2;
    try {
      cb && cb(note, velocity);
    } catch (err) {
      console.error("Error in MIDI callback", err);
    }
  }
  // You can handle NoteOff or CC messages here if needed
}
