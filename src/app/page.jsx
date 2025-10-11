"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [midiAccess, setMidiAccess] = useState(null);
  const [status, setStatus] = useState("Waiting for MIDI input...");
  const [sceneVisible, setSceneVisible] = useState(false);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setStatus("WebMIDI not supported in this browser.");
      return;
    }

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
  }, []);

  const onMIDISuccess = (access) => {
    setMidiAccess(access);
    setStatus("MIDI access granted. Listening for input...");

    for (let input of access.inputs.values()) {
      input.onmidimessage = handleMIDIMessage;
    }

    access.onstatechange = (event) => {
      setStatus(`MIDI device ${event.port.name} ${event.port.state}`);
    };
  };

  const onMIDIFailure = () => {
    setStatus("Failed to get MIDI access.");
  };

  const handleMIDIMessage = (message) => {
    const [command, note, velocity] = message.data;

    if (command === 144 && velocity > 0) {
      // note on
      setSceneVisible((prev) => !prev);
      setStatus(`Note ${note} triggered scene ${sceneVisible ? "fade out" : "reveal"}`);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold mb-4">🎛️ WebMIDI Fog Trigger Demo</h1>
      <p className="text-gray-400 mb-4">{status}</p>

      <div
        className={`transition-all duration-700 w-96 h-60 rounded-2xl ${
          sceneVisible ? "bg-white/90" : "bg-gray-800/10 blur-lg"
        }`}
      ></div>

      <p className="mt-6 text-sm text-gray-500">
        Press a MIDI note to reveal or hide the scene.
      </p>
    </main>
  );
}
