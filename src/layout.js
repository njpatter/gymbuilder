/**
 * Wait until view containers have measurable layout (avoids 0×0 Konva stages).
 * @param {Record<string, HTMLElement | null | undefined>} containers
 * @param {number} [maxFrames]
 */
export function waitForViewLayout(containers, maxFrames = 60) {
  return new Promise((resolve) => {
    let frame = 0;
    const tick = () => {
      const ready = Object.values(containers).every(
        (el) => el && el.clientWidth >= 20 && el.clientHeight >= 20,
      );
      if (ready || frame >= maxFrames) {
        resolve();
        return;
      }
      frame += 1;
      requestAnimationFrame(tick);
    };
    tick();
  });
}
