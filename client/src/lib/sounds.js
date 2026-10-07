function createSound(src) {
  const audio = new Audio(src);
  audio.volume = 0.6;
  audio.preload = "auto";
  return audio;
}

const sounds = { user: createSound("/user.mp3"), bot: createSound("/bot.mp3") };

export function playSound(name) {
  const audio = sounds[name];
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay can be blocked until the user interacts with the page.
  });
}
