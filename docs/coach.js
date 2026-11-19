// The coach in the explorer's card: Lichess Neo's own 3D mascot (vendor/mascot.js, with
// three.js), loaded once the card is in sight. Its still shows until then, and stays without WebGL.
// Its mood follows the position, as the review's avatar follows a move's verdict.

const COACH = 4;

export class Coach {
  #host;
  #face;
  #view = null;
  #mood = 'neutral';
  #talking = false;
  #loading = false;

  constructor(host) {
    this.#host = host;
    this.#face = document.createElement('span');
    this.#face.className = 'coach-face';
    this.#face.style.setProperty('--still', `url("${new URL(`./coaches/mascot-${COACH}.webp`, import.meta.url).href}")`);
    host.append(this.#face);
    host.addEventListener('click', () => this.#view?.poke());
    const seen = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      seen.disconnect();
      this.#mount();
    });
    seen.observe(host);
  }

  async #mount() {
    if (this.#loading) return;
    this.#loading = true;
    // Without WebGL the still stays, and the 3D coach isn't downloaded at all.
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
    try {
      const { mountMascot } = await import('./vendor/mascot.js');
      this.#view = mountMascot(this.#face, {
        onDrawn: () => {
          this.#host.classList.add('live');
          this.#view?.setMood(this.#mood);
        },
      });
      this.#view?.setCoach(COACH);
      this.#view?.setTalking(this.#talking);
    } catch (error) {
      console.warn('The 3D coach could not load; its still stays.', error);
    }
  }

  setMood(mood) {
    this.#mood = mood;
    if (this.#host.classList.contains('live')) this.#view?.setMood(mood);
  }

  setTalking(talking) {
    this.#talking = talking;
    this.#view?.setTalking(talking);
  }
}
