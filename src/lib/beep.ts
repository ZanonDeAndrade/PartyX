export function beep(kind) {
  try {
    const C =
      (window as any).__pxac ||
      ((window as any).__pxac = new (window.AudioContext || (window as any).webkitAudioContext)());
    const seq =
      kind === 'ok'
        ? [[880, 0, 0.15]]
        : kind === 'used'
          ? [
              [440, 0, 0.14],
              [440, 0.2, 0.14],
            ]
          : [[220, 0, 0.5]];
    seq.forEach(([f, st, du]) => {
      const o = C.createOscillator(),
        g = C.createGain();
      o.frequency.value = f;
      o.type = 'square';
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(C.destination);
      o.start(C.currentTime + st);
      o.stop(C.currentTime + st + du);
    });
  } catch (e) {}
}
